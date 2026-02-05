import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { Repository, Brackets, SelectQueryBuilder } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

export interface CustomPaginatedResponse<T> {
  total_records: number;
  current_page: number;
  per_page: number;
  records: T[];
}

type Filters = Record<string, any>;
type Paginated<T> = {
  total_records: number;
  current_page: number;
  per_page: number;
  records: T[];
};

export class CRUD {
  static async findAll<T>(repository: Repository<T>, entityName: string, search?: string, page: any = 1, limit: any = 10, sortBy?: string, sortOrder: 'ASC' | 'DESC' = 'DESC', relations: string[] = [], searchFields: string[] = [], filters?: Filters, orFilters?: Filters[]): Promise<Paginated<T>> {
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;

    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber < 1 || limitNumber < 1) {
      throw new BadRequestException('Pagination parameters must be valid numbers greater than 0.');
    }
    if (!['ASC', 'DESC'].includes(sortOrder)) {
      throw new BadRequestException("Sort order must be either 'ASC' or 'DESC'.");
    }

    const skip = (pageNumber - 1) * limitNumber;
    const qb = repository.createQueryBuilder(entityName).skip(skip).take(limitNumber);

    // ---------- helpers ----------
    const meta = repository.metadata;

    // propertyName -> column metadata
    const colByProp = new Map(meta.columns.map(c => [c.propertyName, c]));
    // databaseName -> column metadata
    const colByDb = new Map(meta.columns.map(c => [c.databaseName, c]));

    const joined = new Set<string>(); // relation aliases we already joined

    // is the first N segments a valid relation path starting from current metadata?
    function isRelationPath(path: string): boolean {
      const parts = path.split('.');
      let currentMeta: any = meta;
      for (const part of parts) {
        const rel = currentMeta.relations.find(r => r.propertyName === part || r.relationPath === part);
        if (!rel) return false;
        currentMeta = rel.inverseEntityMetadata;
      }
      return true;
    }

    // join relation path ONLY if it’s a real path (e.g., 'owner' or 'owner.profile')
    function ensureJoin(path: string) {
      if (!path || !isRelationPath(path)) return; // <- do nothing for scalar columns like 'created_at'
      const parts = path.split('.');
      let currentAlias = entityName;
      let aliasSoFar = '';
      let currentMeta = meta;

      for (const part of parts) {
        const rel = currentMeta.relations.find((r: any) => r.propertyName === part || r.relationPath === part);
        if (!rel) break;
        aliasSoFar = aliasSoFar ? `${aliasSoFar}.${part}` : part;
        if (!joined.has(aliasSoFar)) {
          qb.leftJoin(`${currentAlias}.${part}`, aliasSoFar);
          joined.add(aliasSoFar);
        }
        currentAlias = aliasSoFar;
        currentMeta = rel.inverseEntityMetadata;
      }
    }

    // resolve base-entity column name (accepts 'created_at' or 'createdAt')
    function resolveOwnColumnName(field: string): string | null {
      const col = colByProp.get(field) || colByDb.get(field) || (field === 'created_at' ? colByProp.get('createdAt') : null) || (field === 'createdAt' ? colByDb.get('created_at') : null);
      return col ? col.databaseName : null;
    }

    function qualifyField(fieldPath: string): string {
      if (!fieldPath.includes('.')) {
        const dbName = resolveOwnColumnName(fieldPath) || fieldPath;
        return `${entityName}.${dbName}`;
      }
      const parts = fieldPath.split('.');
      const relationPath = parts.slice(0, -1).join('.');
      const last = parts[parts.length - 1];
      ensureJoin(relationPath); // only joins if real relation path
      const alias = isRelationPath(relationPath) ? relationPath : entityName;
      return `${alias}.${last}`;
    }

    function flatten(obj: any, prefix = ''): Record<string, any> {
      const out: Record<string, any> = {};
      if (!obj || typeof obj !== 'object') return out;
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
        else out[key] = v;
      }
      return out;
    }

    // join & select requested relations first
    if (relations?.length) {
      const invalid = relations.filter(r => !meta.relations.some((rel: any) => rel.propertyName === r || rel.relationPath === r));
      if (invalid.length) throw new BadRequestException(`Invalid relations: ${invalid.join(', ')}`);
      for (const rel of relations) {
        qb.leftJoinAndSelect(`${entityName}.${rel}`, rel);
        joined.add(rel);
      }
    }

    // ---------- filters (with operators) ----------
    // supports: = (default), like, ilike, gt, gte, lt, lte, ne, isnull
    function applyFilter(key: string, value: any) {
      let base = key;
      let op: string | null = null;
      const knownOps = ['like', 'ilike', 'gt', 'gte', 'lt', 'lte', 'ne', 'isnull'];

      const i = key.lastIndexOf('.');
      if (i > -1) {
        const maybeOp = key.slice(i + 1);
        if (knownOps.includes(maybeOp)) {
          base = key.slice(0, i);
          op = maybeOp;
        }
      }

      // special literal for null
      if (value === '__NULL__') {
        op = 'isnull';
        value = true;
      }

      const qualified = qualifyField(base);
      const param = key.replace(/\./g, '_');

      switch (op) {
        case 'like':
          qb.andWhere(`${qualified} LIKE :${param}`, { [param]: `%${value}%` });
          break;
        case 'ilike':
          qb.andWhere(`${qualified} ILIKE :${param}`, { [param]: `%${value}%` });
          break;
        case 'gt':
          qb.andWhere(`${qualified} > :${param}`, { [param]: value });
          break;
        case 'gte':
          qb.andWhere(`${qualified} >= :${param}`, { [param]: value });
          break;
        case 'lt':
          qb.andWhere(`${qualified} < :${param}`, { [param]: value });
          break;
        case 'lte':
          qb.andWhere(`${qualified} <= :${param}`, { [param]: value });
          break;
        case 'ne':
          qb.andWhere(`${qualified} <> :${param}`, { [param]: value });
          break;
        case 'isnull':
          if (value === true || value === 'true' || value === 1 || value === '1') {
            qb.andWhere(`${qualified} IS NULL`);
          } else {
            qb.andWhere(`${qualified} IS NOT NULL`);
          }
          break;
        default:
          if (value !== null && value !== undefined && value !== '') {
            qb.andWhere(`${qualified} = :${param}`, { [param]: value });
          }
      }
    }

    if (filters && Object.keys(filters).length) {
      const flat = flatten(filters);

      // group ops per base field to allow BETWEEN (gte + lte)
      const grouped: Record<string, Record<string, any>> = {};
      for (const [k, v] of Object.entries(flat)) {
        const j = k.lastIndexOf('.');
        const base = j > -1 ? k.slice(0, j) : k;
        const op = j > -1 ? k.slice(j + 1) : 'eq';
        if (!grouped[base]) grouped[base] = {};
        grouped[base][op] = v;
      }

      for (const [base, ops] of Object.entries(grouped)) {
        if (ops.gte !== undefined && ops.lte !== undefined) {
          const qualified = qualifyField(base);
          const pFrom = base.replace(/\./g, '_') + '_from';
          const pTo = base.replace(/\./g, '_') + '_to';
          // If range is provided as simple dates (YYYY-MM-DD), use DATE() casting for timestamp support
          if (typeof ops.gte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ops.gte) && 
              typeof ops.lte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ops.lte)) {
            qb.andWhere(`DATE(${qualified}) BETWEEN :${pFrom} AND :${pTo}`, {
              [pFrom]: ops.gte,
              [pTo]: ops.lte,
            });
          } else {
            qb.andWhere(`${qualified} BETWEEN :${pFrom} AND :${pTo}`, {
              [pFrom]: ops.gte,
              [pTo]: ops.lte,
            });
          }
          for (const [op, val] of Object.entries(ops)) {
            if (op === 'gte' || op === 'lte') continue;
            if (op === 'eq') applyFilter(base, val);
            else applyFilter(`${base}.${op}`, val);
          }
        } else {
          for (const [op, val] of Object.entries(ops)) {
            if (op === 'eq') applyFilter(base, val);
            else applyFilter(`${base}.${op}`, val);
          }
        }
      }
    }

    // ---------- search ----------
// ---------- search ----------
if (search && searchFields?.length) {
  qb.andWhere(
    new Brackets(qb2 => {
      for (const field of searchFields) {
        if (field.includes('.')) {
          // joined search: e.g. 'owner.username'
          const qualified = qualifyField(field);
          qb2.orWhere(`${qualified}::text ILIKE :search`, { search: `%${search}%` }); // Changed to ILIKE with cast
          continue;
        }
        const dbName = resolveOwnColumnName(field);
        if (!dbName) continue;
        const qualified = `${entityName}.${dbName}`;
        qb2.orWhere(`${qualified}::text ILIKE :search`, { search: `%${search}%` }); // Changed to ILIKE with cast
      }
    }),
  );
}
   if (orFilters?.length) {
      qb.andWhere(
        new Brackets(qb2 => {
          orFilters.forEach((orFilter, index) => {
            qb2.orWhere(
              new Brackets(qb3 => {
                const flat = flatten(orFilter);
                for (const [key, value] of Object.entries(flat)) {
                  if (value === null || value === undefined || value === '') continue;
                  // Use the same applyFilter logic but within OR brackets
                  const param = `or_${index}_${key.replace(/\./g, '_')}`;
                  const qualified = qualifyField(key);
                  qb3.andWhere(`${qualified} = :${param}`, { [param]: value });
                }
              })
            );
          });
        })
      );
    }
    // ---------- sorting ----------
    if (sortBy?.includes('.')) {
      // e.g., sortBy=owner.username
      const qualified = qualifyField(sortBy);
      qb.orderBy(qualified, sortOrder);
    } else {
      const field = sortBy || 'created_at';
      const dbName = resolveOwnColumnName(field);
      if (!dbName) {
        const available = meta.columns.map(c => c.propertyName).join(', ');
        throw new BadRequestException(`Invalid sortBy field: '${field}'. Available: ${available}`);
      }
      qb.orderBy(`${entityName}.${dbName}`, sortOrder);
    }

    // ---------- result ----------
    const [data, total] = await qb.getManyAndCount();
    return {
      total_records: total,
      current_page: pageNumber,
      per_page: limitNumber,
      records: data,
    };
  }

  static joinNestedRelations<T>(qb: SelectQueryBuilder<T>, repository: Repository<T>, rootAlias: string, relations: string[] = []): any {
    const addedAliases = new Set<string>();
    const aliasMap: any = new Map();

    function validatePathAndReturnJoins(path: string) {
      const segments = path.split('.');
      let currentMeta = repository.metadata;
      let parentAlias = rootAlias;
      const steps: { joinPath: string; alias: string; relationPath: string }[] = [];
      let aliasPath = rootAlias;
      let relationPath = '';

      for (const seg of segments) {
        const relMeta = currentMeta.relations.find(r => r.propertyName === seg);
        if (!relMeta) {
          throw new BadRequestException(`Invalid relation segment '${seg}' in '${path}'`);
        }
        const joinPath = `${parentAlias}.${seg}`;
        const alias = (aliasPath + '_' + seg).replace(/\./g, '_'); // e.g., product_stock, product_stock_branch
        relationPath = relationPath ? `${relationPath}.${seg}` : seg;

        steps.push({ joinPath, alias, relationPath });

        parentAlias = alias;
        aliasPath = alias;
        currentMeta = relMeta.inverseEntityMetadata;
      }
      return steps;
    }

    for (const path of relations) {
      if (!path) continue;
      const steps = validatePathAndReturnJoins(path);
      for (const { joinPath, alias, relationPath } of steps) {
        if (!addedAliases.has(alias)) {
          qb.leftJoinAndSelect(joinPath, alias);
          addedAliases.add(alias);
        }
        aliasMap.set(relationPath, alias);
      }
    }

    return aliasMap;
  }

  static async findAll2<T>(repository: Repository<T>, entityName: string, search?: string, page: any = 1, limit: any = 10, sortBy?: string, sortOrder: 'ASC' | 'DESC' = 'DESC', relations: string[] = [], searchFields: string[] = [], filters?: Record<string, any>): Promise<CustomPaginatedResponse<T>> {
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;

    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber < 1 || limitNumber < 1) {
      throw new BadRequestException('Pagination parameters must be valid numbers greater than 0.');
    }
    if (!['ASC', 'DESC'].includes(sortOrder)) {
      throw new BadRequestException("Sort order must be either 'ASC' or 'DESC'.");
    }

    const skip = (pageNumber - 1) * limitNumber;
    const qb = repository.createQueryBuilder(entityName).skip(skip).take(limitNumber);

    // --- helpers/meta ---
    const meta = repository.metadata;
    const colByProp = new Map(meta.columns.map(c => [c.propertyName, c]));
    const colByDb = new Map(meta.columns.map(c => [c.databaseName, c]));

    function resolveOwnColumnName(field: string): string | null {
      const col = colByProp.get(field) || colByDb.get(field) || (field === 'created_at' ? colByProp.get('createdAt') : null) || (field === 'createdAt' ? colByDb.get('created_at') : null);
      return col ? col.databaseName : null;
    }

    function flatten(obj: any, prefix = ''): Record<string, any> {
      const out: Record<string, any> = {};
      if (!obj || typeof obj !== 'object') return out;
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
        else out[key] = v;
      }
      return out;
    }

    // --- compute relation paths needed by filters/sort ---
    const relationPathsFromFilters = new Set<string>();
    const flatFilters = filters && Object.keys(filters).length ? flatten(filters) : {};
    for (const key of Object.keys(flatFilters)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        const knownOps = ['like', 'ilike', 'gt', 'gte', 'lt', 'lte', 'ne', 'isnull'];
        const lastPart = parts[parts.length - 1];

        // If last part is an operator, ignore it for path calculation
        const effectiveParts = knownOps.includes(lastPart) ? parts.slice(0, -1) : parts;
        
        if (effectiveParts.length > 1) {
             const relPath = effectiveParts.slice(0, -1).join('.');
             relationPathsFromFilters.add(relPath);
        }
      }
    }
    if (sortBy?.includes('.')) {
      const parts = sortBy.split('.');
      if (parts.length > 1) {
        relationPathsFromFilters.add(parts.slice(0, -1).join('.'));
      }
    }

    // --- join relations FIRST (requested + implied by filters/sort) ---
    const relationsToJoin = Array.from(new Set([...(relations || []), ...relationPathsFromFilters]));
    const aliasMap = CRUD.joinNestedRelations(qb, repository, entityName, relationsToJoin);

    // qualify field (base or nested via aliasMap)
    function qualifyField(fieldPath: string): string {
      if (!fieldPath.includes('.')) {
        const dbName = resolveOwnColumnName(fieldPath) || fieldPath;
        return `${entityName}.${dbName}`;
      }
      const parts = fieldPath.split('.');
      const relationPath = parts.slice(0, -1).join('.');
      const last = parts[parts.length - 1];
      const alias = aliasMap.get(relationPath);
      if (!alias) {
        // not joined? then it’s invalid relation path
        throw new BadRequestException(`Missing join for relation path '${relationPath}' (from '${fieldPath}')`);
      }
      return `${alias}.${last}`;
    }

    // --- filters (supports ops) ---
    function applyFilter(key: string, value: any) {
      let base = key;
      let op: string | null = null;
      const knownOps = ['like', 'ilike', 'gt', 'gte', 'lt', 'lte', 'ne', 'isnull'];

      const i = key.lastIndexOf('.');
      if (i > -1) {
        const maybeOp = key.slice(i + 1);
        if (knownOps.includes(maybeOp)) {
          base = key.slice(0, i);
          op = maybeOp;
        }
      }

      if (value === '__NULL__') {
        op = 'isnull';
        value = true;
      }

      const qualified = qualifyField(base);
      const param = key.replace(/\./g, '_');

      switch (op) {
        case 'like':
          qb.andWhere(`${qualified} LIKE :${param}`, { [param]: `%${value}%` });
          break;
        case 'ilike':
          qb.andWhere(`${qualified} ILIKE :${param}`, { [param]: `%${value}%` });
          break;
        case 'gt':
          qb.andWhere(`${qualified} > :${param}`, { [param]: value });
          break;
        case 'gte':
          qb.andWhere(`${qualified} >= :${param}`, { [param]: value });
          break;
        case 'lt':
          qb.andWhere(`${qualified} < :${param}`, { [param]: value });
          break;
        case 'lte':
          qb.andWhere(`${qualified} <= :${param}`, { [param]: value });
          break;
        case 'ne':
          qb.andWhere(`${qualified} <> :${param}`, { [param]: value });
          break;
        case 'isnull':
          if (value === true || value === 'true' || value === 1 || value === '1') qb.andWhere(`${qualified} IS NULL`);
          else qb.andWhere(`${qualified} IS NOT NULL`);
          break;
        default:
          if (value !== null && value !== undefined && value !== '') {
            qb.andWhere(`${qualified} = :${param}`, { [param]: value });
          }
      }
    }

    if (filters && Object.keys(filters).length) {
      const flat = flatFilters; // already flattened above
      // group ops per base field to allow BETWEEN (gte + lte)
      const grouped: Record<string, Record<string, any>> = {};
      for (const [k, v] of Object.entries(flat)) {
        const j = k.lastIndexOf('.');
        const base = j > -1 ? k.slice(0, j) : k;
        const op = j > -1 ? k.slice(j + 1) : 'eq';
        if (!grouped[base]) grouped[base] = {};
        grouped[base][op] = v;
      }

      for (const [base, ops] of Object.entries(grouped)) {
        if (ops.gte !== undefined && ops.lte !== undefined) {
          const qualified = qualifyField(base);
          const pFrom = base.replace(/\./g, '_') + '_from';
          const pTo = base.replace(/\./g, '_') + '_to';
          // If range is provided as simple dates (YYYY-MM-DD), use DATE() casting for timestamp support
          if (typeof ops.gte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ops.gte) && 
              typeof ops.lte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ops.lte)) {
            qb.andWhere(`DATE(${qualified}) BETWEEN :${pFrom} AND :${pTo}`, {
              [pFrom]: ops.gte,
              [pTo]: ops.lte,
            });
          } else {
            qb.andWhere(`${qualified} BETWEEN :${pFrom} AND :${pTo}`, {
              [pFrom]: ops.gte,
              [pTo]: ops.lte,
            });
          }
          for (const [op, val] of Object.entries(ops)) {
            if (op === 'gte' || op === 'lte') continue;
            if (op === 'eq') applyFilter(base, val);
            else applyFilter(`${base}.${op}`, val);
          }
        } else {
          for (const [op, val] of Object.entries(ops)) {
            if (op === 'eq') applyFilter(base, val);
            else applyFilter(`${base}.${op}`, val);
          }
        }
      }
    }

    // --- search ---
    if (search && searchFields?.length) {
      qb.andWhere(
        new Brackets(qb2 => {
          for (const field of searchFields) {
            try {
              const qualified = qualifyField(field);
              // We cast to text for robustness; adjust if you want type-aware like earlier logic
              qb2.orWhere(`LOWER(${qualified}::text) LIKE LOWER(:search)`, { search: `%${search}%` });
            } catch {
              // ignore fields that aren't valid in this entity (e.g., misconfigured field)
            }
          }
        }),
      );
    }

    // --- sorting (supports nested) ---
    if (sortBy?.includes('.')) {
      const qualified = qualifyField(sortBy);
      qb.orderBy(qualified, sortOrder);
    } else {
      const field = sortBy || 'created_at';
      const dbName = resolveOwnColumnName(field);
      if (!dbName) {
        const available = meta.columns.map(c => c.propertyName).join(', ');
        throw new BadRequestException(`Invalid sortBy field: '${field}'. Available: ${available}`);
      }
      qb.orderBy(`${entityName}.${dbName}`, sortOrder);
    }

    const [data, total] = await qb.getManyAndCount();
    return {
      total_records: total,
      current_page: pageNumber,
      per_page: limitNumber,
      records: data,
    };
  }

  static async findAllRelation<T>(repository: Repository<T>, entityName: string, search?: string, page: any = 1, limit: any = 10, sortBy?: string, sortOrder: 'ASC' | 'DESC' = 'DESC', relations?: string[], searchFields?: string[], filters?: Record<string, any>, extraWhere?: (qb: SelectQueryBuilder<T>) => void ): Promise<CustomPaginatedResponse<T>> {
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;

    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber < 1 || limitNumber < 1) {
      throw new BadRequestException('Pagination parameters must be valid numbers greater than 0.');
    }


    if (!['ASC', 'DESC'].includes(sortOrder)) {
      throw new BadRequestException("Sort order must be either 'ASC' or 'DESC'.");
    }

    const skip = (pageNumber - 1) * limitNumber;
    const query = repository.createQueryBuilder(entityName).skip(skip).take(limitNumber);
    if (extraWhere) {
      extraWhere(query);
    }

function flatten(obj: any, prefix = ''): Record<string, any> {
  let result: Record<string, any> = {};

  Object.entries(obj).forEach(([key, value]) => {
    const prefixedKey = prefix ? `${prefix}.${key}` : key;

    // ✅ DO NOT FLATTEN TypeORM operators
    if (value instanceof FindOperator) {
      result[prefixedKey] = value;
      return;
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flatten(value, prefixedKey));
    } else {
      result[prefixedKey] = value;
    }
  });

  return result;
}

    if (filters && Object.keys(filters).length > 0) {
      const flatFilters = flatten(filters);

      Object.entries(flatFilters).forEach(([flatKey, value]) => {
        if (value === null || value === undefined || value === '') return;

        // ❗ Block internal or unsafe parameter keys
        const forbidden = ['getsql', 'getquery', 'constructor', 'tostring', 'entity'];
        if (forbidden.some(f => flatKey.toLowerCase().includes(f))) {
          return; // skip dangerous keys
        }

        // 🔹 Special date filters on created_at (date only)
        // filters[start_date]  => DATE(created_at) >= start_date
        // filters[end_date]    => DATE(created_at) <= end_date
        // filters[created_at]  => DATE(created_at) = created_at (same day)
        const paramKey = flatKey
        .replace(/\./g, '_')      // replace dots
        .replace(/\[/g, '_')      // replace [
        .replace(/\]/g, '_')      // replace ]
        .replace(/[^a-zA-Z0-9_]/g, ''); // remove anything invalid

        if (flatKey === 'start_date') {
          query.andWhere(`DATE(${entityName}.created_at) >= :${paramKey}`, {
            [paramKey]: value, // expect 'YYYY-MM-DD'
          });
          return;
        }

        if (flatKey === 'end_date') {
          query.andWhere(`DATE(${entityName}.created_at) <= :${paramKey}`, {
            [paramKey]: value, // expect 'YYYY-MM-DD'
          });
          return;
        }

        if (flatKey === 'created_at' || flatKey === 'created_ate') {
          // "same day" filter: ignore time part in DB
          query.andWhere(`DATE(${entityName}.created_at) = :${paramKey}`, {
            [paramKey]: value, // expect 'YYYY-MM-DD'
          });
          return;
        }

if (value instanceof FindOperator) {
  const paramKey = flatKey.replace(/\./g, '_');
  let qualifiedName = `${entityName}.${flatKey}`;

  // Handle nested paths for FindOperator
  if (flatKey.includes('.')) {
    const parts = flatKey.split('.');
    const column = parts.pop()!;
    let alias = entityName;
    for (const seg of parts) {
      alias = `${alias}_${seg}`;
    }
    qualifiedName = `${alias}.${column}`;
  }

  if (value.type === 'lessThanOrEqual') {
    query.andWhere(`${qualifiedName} <= :${paramKey}`, {
      [paramKey]: value.value,
    });
    return;
  }

  if (value.type === 'moreThanOrEqual') {
    query.andWhere(`${qualifiedName} >= :${paramKey}`, {
      [paramKey]: value.value,
    });
    return;
  }
  
  // SUPPORT FOR 'IN' OPERATOR
  if (value.type === 'in') {
    query.andWhere(`${qualifiedName} IN (:...${paramKey})`, {
       [paramKey]: value.value,
    });
    return;
  }
}
        // 🔹 Range filters: "<field>_from" / "<field>_to"
        // e.g. audit_date_from / audit_date_to
        const isFrom = flatKey.endsWith('_from');
        const isTo = flatKey.endsWith('_to');

        if (isFrom || isTo) {
          const baseKey = flatKey.replace(/_(from|to)$/, ''); // "audit_date"
          const operator = isFrom ? '>=' : '<='; // from → >= , to → <=
          const rangeParamKey = flatKey.replace(/\./g, '_');

          if (baseKey.includes('.')) {
            const parts = baseKey.split('.');
            const column = parts.pop()!;
            let alias = entityName;
            for (const seg of parts) {
              alias = `${alias}_${seg}`;
            }

            query.andWhere(`DATE(${alias}.${column}) ${operator} :${rangeParamKey}`, {
              [rangeParamKey]: value,
            });
          } else {
            query.andWhere(`DATE(${entityName}.${baseKey}) ${operator} :${rangeParamKey}`, {
              [rangeParamKey]: value,
            });
          }

          return; // important: skip default "=" logic
        }

        // 🔹 Normal filters (exact match)
        if (flatKey.includes('.')) {
          const parts = flatKey.split('.');
          const column = parts.pop()!; // "id"
          let alias = entityName; // "audit"
          for (const seg of parts) {
            alias = `${alias}_${seg}`; // "audit_branch_city"
          }

          query.andWhere(`${alias}.${column} = :${paramKey}`, {
            [paramKey]: value,
          });
        } else {
          // simple field on root entity
          query.andWhere(`${entityName}.${flatKey} = :${paramKey}`, {
            [paramKey]: value,
          });
        }
      });
    }

    if (relations?.length) {
      CRUD.joinNestedRelations2(query, repository, entityName, relations);
    }

    if (search && searchFields?.length >= 1) {
      query.andWhere(
        new Brackets(qb => {
          searchFields.forEach(field => {
            if (field.includes('.')) {
               qb.orWhere(`${field}::text ILIKE :s`, { s: `%${search}%` });
               return;
            }
            const col = repository.metadata.columns.find(c => c.propertyName === field);
            const typeStr = String(col?.type || '').toLowerCase();

            // Enums: only exact match
            if (col?.enum && Array.isArray(col.enum)) {
              if (col.enum.includes(search)) {
                qb.orWhere(`${entityName}.${field} = :enumVal`, { enumVal: search });
              }
              return;
            }

            const isNumericType = ['int', 'int2', 'int4', 'int8', 'integer', 'bigint', 'smallint', 'numeric', 'decimal', 'float', 'float4', 'float8', 'double precision', Number].includes(col?.type as any);

            if (isNumericType) {
                const n = Number(search);
                if(!Number.isNaN(n)) {
                     qb.orWhere(`${entityName}.${field} = :n`, { n });
                }
                return;
            }

            // JSON/JSONB → cast to text + ILIKE
            if (typeStr === 'jsonb' || typeStr === 'json') {
              qb.orWhere(`${entityName}.${field}::text ILIKE :s`, { s: `%${search}%` });
              return;
            }

            // Default: cast to text and ILIKE
            qb.orWhere(`${entityName}.${field}::text ILIKE :s`, { s: `%${search}%` });
          });
        }),
      );
    }

    const defaultSortBy = 'created_at';
    const sortField = sortBy || defaultSortBy;
    const sortDirection = sortOrder || 'DESC';

    const columnExists = repository.metadata.columns.some(col => col.propertyName === sortField);
    if (!columnExists) {
      throw new BadRequestException(`Invalid sortBy field: '${sortField}'`);
    }

    query.orderBy(`${entityName}.${sortField}`, sortDirection);

    const [data, total] = await query.getManyAndCount();

    return {
      total_records: total,
      current_page: pageNumber,
      per_page: limitNumber,
      records: data,
    };
  }

  static joinNestedRelations2<T>(query: SelectQueryBuilder<T>, repository: Repository<T>, rootAlias: string, relations: string[]) {
    const addedAliases = new Set<string>();

    function validatePathAndReturnJoins(path: string) {
      const segments = path.split('.');
      let currentMeta = repository.metadata;
      let parentAlias = rootAlias;
      const steps: { joinPath: string; alias: string }[] = [];
      let aliasPath = rootAlias;

      for (const seg of segments) {
        const relMeta = currentMeta.relations.find(r => r.propertyName === seg);
        if (!relMeta) {
          throw new BadRequestException(`Invalid relation segment '${seg}' in '${path}'`);
        }
        const joinPath = `${parentAlias}.${seg}`;
        const alias = (aliasPath + '_' + seg).replace(/\./g, '_');
        steps.push({ joinPath, alias });

        parentAlias = alias;
        aliasPath = alias;
        currentMeta = relMeta.inverseEntityMetadata;
      }
      return steps;
    }

    for (const path of relations) {
      const steps = validatePathAndReturnJoins(path);
      for (const { joinPath, alias } of steps) {
        if (!addedAliases.has(alias)) {
          query.leftJoinAndSelect(joinPath, alias);
          addedAliases.add(alias);
        }
      }
    }
  }

  static async delete<T>(repository: Repository<T>, entityName: string, id: number | string): Promise<{ message: string }> {
    const entity = await repository.findOne({ where: { id } as any });

    if (!entity) {
      throw new BadRequestException(`${entityName} with ID ${id} not found.`);
    }

    await repository.softDelete(id);

    return {
      message: `${entityName} deleted successfully.`,
    };
  }

  static async softDelete<T>(repository: Repository<T>, entityName: string, id: number | string): Promise<{ message: string }> {
    const entity = await repository.findOne({ where: { id } as any });

    if (!entity) {
      throw new BadRequestException(`${entityName} with ID ${id} not found.`);
    }

    await repository.softDelete(id);

    return {
      message: `${entityName} soft-deleted successfully.`,
    };
  }

  static async findOne<T>(repository: Repository<T>, entityName: string, id: number | string, relations?: string[]): Promise<T> {
    const qb = repository.createQueryBuilder(entityName);

    // Detect primary key column instead of hard-coding "id"
    const primaryColumns = repository.metadata.primaryColumns;
    if (!primaryColumns.length) {
      throw new BadRequestException(`${entityName} has no primary column metadata defined.`);
    }
    const primaryColumn = primaryColumns[0]; // assume single PK
    const primaryPropName = primaryColumn.propertyName;

    // WHERE <alias>.<pk> = :id
    qb.where(`${entityName}.${primaryPropName} = :id`, { id });

    // Use the SAME nested relation logic as findAllRelation
    if (relations?.length) {
      // This will validate paths and throw BadRequestException
      // for invalid segments, exactly like in findAllRelation
      CRUD.joinNestedRelations2(qb, repository, entityName, relations);
    }

    const entity = await qb.getOne();

    if (!entity) {
      throw new BadRequestException(`${entityName} with ID ${id} not found.`);
    }

    return entity;
  }

  static async exportEntityToExcel<T>(
    repository: Repository<T>,
    fileName: string,
    res: any,
    options: {
      exportLimit?: number | string;
      columns?: { header: string; key: string; width?: number }[];
    } = {},
  ) {
    const normalizedLimit = String(options.exportLimit).toLowerCase().trim();
    let take: number | undefined;

    if (normalizedLimit === 'all') {
      take = undefined;
    } else {
      const n = Number(options.exportLimit);
      take = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1000;
    }

    const data = await repository.find({
      take,
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    const columns =
      options.columns ??
      (data.length > 0
        ? Object.keys(data[0])
            .filter(key => key !== 'updated_at' && key !== 'deleted_at')
            .map(key => ({ header: key, key, width: 20 }))
        : []);

    worksheet.columns = columns;

    data.forEach(item => {
      const rowData: any = { ...item };
      delete rowData.updated_at;
      delete rowData.deleted_at;

      const row = worksheet.addRow(rowData);

      row.eachCell(cell => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCCCCC' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    worksheet.columns.forEach(column => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, cell => {
        const cellValue = cell.value ? cell.value.toString() : '';
        if (cellValue.length > maxLength) maxLength = cellValue.length;
      });
      column.width = maxLength + 2;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  }
  static async findAllWithSearchAndFilters<T>(
    repository: Repository<T>,
    entityName: string,
    search?: string,
    page: any = 1,
    limit: any = 10,
    sortBy?: string,
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    relations: string[] = [],
    searchFields: string[] = [],
    filters?: Record<string, any>
  ): Promise<CustomPaginatedResponse<T>> {


    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;

    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber < 1 || limitNumber < 1) {
      throw new BadRequestException('Pagination parameters must be valid numbers greater than 0.');
    }

    if (!['ASC', 'DESC'].includes(sortOrder)) {
      throw new BadRequestException("Sort order must be either 'ASC' or 'DESC'.");
    }

    const skip = (pageNumber - 1) * limitNumber;
    const qb = repository.createQueryBuilder(entityName).skip(skip).take(limitNumber);

    // Get metadata
    const meta = repository.metadata;
    const colByProp = new Map(meta.columns.map(c => [c.propertyName, c]));
    const colByDb = new Map(meta.columns.map(c => [c.databaseName, c]));

    // Helper functions
    function resolveOwnColumnName(field: string): string | null {
      const col = colByProp.get(field) || colByDb.get(field) ||
                  (field === 'created_at' ? colByProp.get('createdAt') : null) ||
                  (field === 'createdAt' ? colByDb.get('created_at') : null);
      return col ? col.databaseName : null;
    }

    function flatten(obj: any, prefix = ''): Record<string, any> {
      const out: Record<string, any> = {};
      if (!obj || typeof obj !== 'object') return out;
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          Object.assign(out, flatten(v, key));
        } else {
          out[key] = v;
        }
      }
      return out;
    }

    // 1. Determine all relations needed
    const relationPathsNeeded = new Set<string>();

    // Add requested relations
    relations.forEach(rel => relationPathsNeeded.add(rel));

    // Check filters for nested paths
    if (filters) {
      const flatFilters = flatten(filters);

      for (const key of Object.keys(flatFilters)) {
        if (key.includes('.')) {
          const parts = key.split('.');
          if (parts.length > 1) {
            // Get relation path (remove the last part which is the column)
            const relPath = parts.slice(0, -1).join('.');
            relationPathsNeeded.add(relPath);
          }
        }
      }
    }


    // 2. Join all required relations
    const relationsToJoin = Array.from(relationPathsNeeded);
    const aliasMap = CRUD.joinNestedRelations(qb, repository, entityName, relationsToJoin);

    // 3. Helper to qualify field paths
    function qualifyField(fieldPath: string): string {
      if (!fieldPath.includes('.')) {
        // Root entity field
        const dbName = resolveOwnColumnName(fieldPath) || fieldPath;
        return `${entityName}.${dbName}`;
      }

      // Nested field (relation.field)
      const parts = fieldPath.split('.');
      const relationPath = parts.slice(0, -1).join('.');
      const last = parts[parts.length - 1];

      // Get alias for the relation
      const alias = aliasMap.get(relationPath);

      if (!alias) {

        // Try to create the alias manually
        return `${relationPath}.${last}`;
      }

      return `${alias}.${last}`;
    }

    // Counter for unique parameter names
    let paramCounter = 0;

    // 4. Apply filters (including nested filters)
    if (filters && Object.keys(filters).length) {
      const flatFilters = flatten(filters);


      for (const [key, value] of Object.entries(flatFilters)) {
        if (value === null || value === undefined || value === '') {

          continue;
        }


        // Handle special operators
        const parts = key.split('.');
        const lastPart = parts[parts.length - 1];
        const knownOps = ['like', 'ilike', 'gt', 'gte', 'lt', 'lte', 'ne', 'isnull'];

        let fieldPath = key;
        let operator = 'eq'; // Default operator

        if (knownOps.includes(lastPart)) {
          // Operator is specified (e.g., 'created_at.gte')
          fieldPath = parts.slice(0, -1).join('.');
          operator = lastPart;
        }

        const qualified = qualifyField(fieldPath);

        // Create a safe parameter name (no special characters except underscore)
        paramCounter++;
        const paramName = `param_${paramCounter}`;

        switch (operator) {
          case 'like':
            qb.andWhere(`${qualified} LIKE :${paramName}`, { [paramName]: `%${value}%` });
            break;
          case 'ilike':
            qb.andWhere(`${qualified} ILIKE :${paramName}`, { [paramName]: `%${value}%` });
            break;
          case 'gt':
            qb.andWhere(`${qualified} > :${paramName}`, { [paramName]: value });
            break;
          case 'gte':
            qb.andWhere(`${qualified} >= :${paramName}`, { [paramName]: value });
            break;
          case 'lt':
            qb.andWhere(`${qualified} < :${paramName}`, { [paramName]: value });
            break;
          case 'lte':
            qb.andWhere(`${qualified} <= :${paramName}`, { [paramName]: value });
            break;
          case 'ne':
            qb.andWhere(`${qualified} != :${paramName}`, { [paramName]: value });
            break;
          case 'isnull':
            if (value === true || value === 'true' || value === 1) {
              qb.andWhere(`${qualified} IS NULL`);
            } else {
              qb.andWhere(`${qualified} IS NOT NULL`);
            }
            break;
          default:
            // Default operator: equals
            qb.andWhere(`${qualified} = :${paramName}`, { [paramName]: value });
            break;
        }

      }
    }

    // 5. Apply search WITHIN the filtered results
    if (search && searchFields?.length) {

      const searchParamName = `searchParam`;

      qb.andWhere(
        new Brackets(qb2 => {
          for (const field of searchFields) {
            try {
              const qualified = qualifyField(field);
              // For text search, use ILIKE for case-insensitive matching
              qb2.orWhere(`${qualified} ILIKE :${searchParamName}`);
            } catch (error) {
              // Skip invalid fields
              console.warn(`Skipping invalid search field: ${field}`, error.message);
            }
          }
        }),
      ).setParameter(searchParamName, `%${search}%`);
    }

    // 6. Apply sorting
    if (sortBy) {
      const qualified = qualifyField(sortBy);
      qb.orderBy(qualified, sortOrder);
    } else {
      // Default sorting
      const dbName = resolveOwnColumnName('created_at') || 'created_at';
      qb.orderBy(`${entityName}.${dbName}`, sortOrder);
    }

    // Debug: log the query

    // 7. Execute query
    const [data, total] = await qb.getManyAndCount();


    return {
      total_records: total,
      current_page: pageNumber,
      per_page: limitNumber,
      records: data,
    };
  }
  static async exportEntityToExcel2<T>(
    repository: Repository<T>,
    entityName: string,
    fileName: string,
    res: any,
    options: {
      exportLimit?: number | string;
      columns?: { header: string; key: string; width?: number }[];
      search?: string;
      filters?: Record<string, any>;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
      relations?: string[];
      searchFields?: string[];
    } = {},
  ) {
    const normalizedLimit = String(options.exportLimit).toLowerCase().trim();
    let take: number | undefined;

    if (normalizedLimit === 'all') {
      take = undefined;
    } else {
      const n = Number(options.exportLimit);
      take = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1000;
    }

    const qb = repository.createQueryBuilder(entityName);
    if (take) {
        qb.take(take);
    }

    // --- helpers/meta ---
    const meta = repository.metadata;
    const colByProp = new Map(meta.columns.map(c => [c.propertyName, c]));
    const colByDb = new Map(meta.columns.map(c => [c.databaseName, c]));

    function resolveOwnColumnName(field: string): string | null {
      const col = colByProp.get(field) || colByDb.get(field) || (field === 'created_at' ? colByProp.get('createdAt') : null) || (field === 'createdAt' ? colByDb.get('created_at') : null);
      return col ? col.databaseName : null;
    }

    function flatten(obj: any, prefix = ''): Record<string, any> {
      const out: Record<string, any> = {};
      if (!obj || typeof obj !== 'object') return out;
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
        else out[key] = v;
      }
      return out;
    }

    // --- compute relation paths needed by filters/sort ---
    const relationPathsFromFilters = new Set<string>();
    const flatFilters = options.filters && Object.keys(options.filters).length ? flatten(options.filters) : {};
    for (const key of Object.keys(flatFilters)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        const knownOps = ['like', 'ilike', 'gt', 'gte', 'lt', 'lte', 'ne', 'isnull'];
        const lastPart = parts[parts.length - 1];

        // If last part is an operator, ignore it for path calculation
        const effectiveParts = knownOps.includes(lastPart) ? parts.slice(0, -1) : parts;
        
        if (effectiveParts.length > 1) {
             const relPath = effectiveParts.slice(0, -1).join('.');
             relationPathsFromFilters.add(relPath);
        }
      }
    }
    if (options.sortBy?.includes('.')) {
      const parts = options.sortBy.split('.');
      if (parts.length > 1) {
        relationPathsFromFilters.add(parts.slice(0, -1).join('.'));
      }
    }

    // --- join relations FIRST (requested + implied by filters/sort) ---
    const relationsToJoin = Array.from(new Set([...(options.relations || []), ...relationPathsFromFilters]));
    const aliasMap = CRUD.joinNestedRelations(qb, repository, entityName, relationsToJoin);

    // qualify field (base or nested via aliasMap)
    function qualifyField(fieldPath: string): string {
      if (!fieldPath.includes('.')) {
        const dbName = resolveOwnColumnName(fieldPath) || fieldPath;
        return `${entityName}.${dbName}`;
      }
      const parts = fieldPath.split('.');
      const relationPath = parts.slice(0, -1).join('.');
      const last = parts[parts.length - 1];
      const alias = aliasMap.get(relationPath);
      if (!alias) {
        // not joined? then it’s invalid relation path
        throw new BadRequestException(`Missing join for relation path '${relationPath}' (from '${fieldPath}')`);
      }
      return `${alias}.${last}`;
    }

    // --- filters (supports ops) ---
    function applyFilter(key: string, value: any) {
      let base = key;
      let op: string | null = null;
      const knownOps = ['like', 'ilike', 'gt', 'gte', 'lt', 'lte', 'ne', 'isnull'];

      const i = key.lastIndexOf('.');
      if (i > -1) {
        const maybeOp = key.slice(i + 1);
        if (knownOps.includes(maybeOp)) {
          base = key.slice(0, i);
          op = maybeOp;
        }
      }

      if (value === '__NULL__') {
        op = 'isnull';
        value = true;
      }

      const qualified = qualifyField(base);
      const param = key.replace(/\./g, '_');

      switch (op) {
        case 'like':
          qb.andWhere(`${qualified} LIKE :${param}`, { [param]: `%${value}%` });
          break;
        case 'ilike':
          qb.andWhere(`${qualified} ILIKE :${param}`, { [param]: `%${value}%` });
          break;
        case 'gt':
          qb.andWhere(`${qualified} > :${param}`, { [param]: value });
          break;
        case 'gte':
          qb.andWhere(`${qualified} >= :${param}`, { [param]: value });
          break;
        case 'lt':
          qb.andWhere(`${qualified} < :${param}`, { [param]: value });
          break;
        case 'lte':
          qb.andWhere(`${qualified} <= :${param}`, { [param]: value });
          break;
        case 'ne':
          qb.andWhere(`${qualified} <> :${param}`, { [param]: value });
          break;
        case 'isnull':
          if (value === true || value === 'true' || value === 1 || value === '1') qb.andWhere(`${qualified} IS NULL`);
          else qb.andWhere(`${qualified} IS NOT NULL`);
          break;
        default:
          if (value !== null && value !== undefined && value !== '') {
            qb.andWhere(`${qualified} = :${param}`, { [param]: value });
          }
      }
    }

    if (options.filters && Object.keys(options.filters).length) {
      const flat = flatFilters; // already flattened above
      // group ops per base field to allow BETWEEN (gte + lte)
      const grouped: Record<string, Record<string, any>> = {};
      for (const [k, v] of Object.entries(flat)) {
        const j = k.lastIndexOf('.');
        const base = j > -1 ? k.slice(0, j) : k;
        const op = j > -1 ? k.slice(j + 1) : 'eq';
        if (!grouped[base]) grouped[base] = {};
        grouped[base][op] = v;
      }

      for (const [base, ops] of Object.entries(grouped)) {
        if (ops.gte !== undefined && ops.lte !== undefined) {
          const qualified = qualifyField(base);
          const pFrom = base.replace(/\./g, '_') + '_from';
          const pTo = base.replace(/\./g, '_') + '_to';
          // If range is provided as simple dates (YYYY-MM-DD), use DATE() casting for timestamp support
          if (typeof ops.gte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ops.gte) && 
              typeof ops.lte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ops.lte)) {
            qb.andWhere(`DATE(${qualified}) BETWEEN :${pFrom} AND :${pTo}`, {
              [pFrom]: ops.gte,
              [pTo]: ops.lte,
            });
          } else {
            qb.andWhere(`${qualified} BETWEEN :${pFrom} AND :${pTo}`, {
              [pFrom]: ops.gte,
              [pTo]: ops.lte,
            });
          }
          for (const [op, val] of Object.entries(ops)) {
            if (op === 'gte' || op === 'lte') continue;
            if (op === 'eq') applyFilter(base, val);
            else applyFilter(`${base}.${op}`, val);
          }
        } else {
          for (const [op, val] of Object.entries(ops)) {
            if (op === 'eq') applyFilter(base, val);
            else applyFilter(`${base}.${op}`, val);
          }
        }
      }
    }

    // --- search ---
    if (options.search && options.searchFields?.length) {
      qb.andWhere(
        new Brackets(qb2 => {
          for (const field of options.searchFields) {
            try {
              const qualified = qualifyField(field);
              // We cast to text for robustness; adjust if you want type-aware like earlier logic
              qb2.orWhere(`LOWER(${qualified}::text) LIKE LOWER(:search)`, { search: `%${options.search}%` });
            } catch {
              // ignore fields that aren't valid in this entity (e.g., misconfigured field)
            }
          }
        }),
      );
    }

    // --- sorting (supports nested) ---
    const sortOrder = options.sortOrder || 'DESC';
    if (options.sortBy?.includes('.')) {
      const qualified = qualifyField(options.sortBy);
      qb.orderBy(qualified, sortOrder);
    } else {
      const field = options.sortBy || 'created_at';
      const dbName = resolveOwnColumnName(field);
      if (dbName) {
         qb.orderBy(`${entityName}.${dbName}`, sortOrder);
      }
    }

    const data = await qb.getMany();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    const columns =
      options.columns ??
      (data.length > 0
        ? Object.keys(data[0])
            .filter(key => key !== 'updated_at' && key !== 'deleted_at')
            .map(key => ({ header: key, key, width: 20 }))
        : []);

    worksheet.columns = columns;

    data.forEach(item => {
      const rowData: any = { ...item };
      delete rowData.updated_at;
      delete rowData.deleted_at;

      const row = worksheet.addRow(rowData);

      row.eachCell(cell => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCCCCC' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    worksheet.columns.forEach(column => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, cell => {
        const cellValue = cell.value ? cell.value.toString() : '';
        if (cellValue.length > maxLength) maxLength = cellValue.length;
      });
      column.width = maxLength + 2;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  }
}
