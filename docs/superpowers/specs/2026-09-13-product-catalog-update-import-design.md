# Product Catalog Update Import Design

## Context

The project already exposes generic product import endpoints, but the existing update importer can create products, create categories and brands, assign stock, and download images. The supplied `Store and items Update.xlsx` workbook needs a narrower and safer workflow: locate existing products in the authenticated user's project, preview exact changes, and update only the requested catalog fields.

The workbook contains two worksheets. Only the first worksheet, `Sheet1`, is product update input. Its header row is row 2 and it contains 39 data rows. The `Store Name ` worksheet is not part of this product update.

## Decision

Add a dedicated authenticated, update-only product catalog import endpoint. Do not change the behavior of the existing generic import endpoints.

The endpoint will:

- derive the project exclusively from the authenticated login token;
- require `PRODUCT_UPDATE` permission;
- accept `.xlsx` files through the existing upload mechanism;
- default to `dryRun=true`;
- parse and validate the complete workbook before any write;
- match every active product whose current name is an exact normalized match for `system item name` within the authenticated project;
- update every exact database match, including two or more matches when legacy data contains duplicates;
- never create, restore, or delete products;
- never modify categories, brands, stock, images, priority, descriptions, or products in another project;
- update `name`, `model`, `sku`, and `price` only;
- return complete row-level and product-level details during dry runs;
- apply a real import atomically in one database transaction.

## API Contract

### Route

`POST /products/import/catalog-update?dryRun=true|false`

Multipart form field:

- `file`: one `.xlsx` workbook.

`dryRun` defaults to `true`. Only the exact query value `false` enables writes.

### Authorization and project scope

The controller resolves the authenticated user and their project using the existing user/project resolution service. A project identifier supplied in the request body, query, workbook, or filename is ignored and is not part of the contract.

The database query always includes the authenticated project ID. Soft-deleted products are not updated. The response may report that no active product matched, but it must not restore a deleted product.

## Workbook Mapping

Header matching is case-insensitive, trims surrounding whitespace, collapses internal whitespace, and tolerates the spelling already present in the supplied workbook.

| Workbook column | Meaning | Product field |
| --- | --- | --- |
| `system item name` | Exact lookup value for existing products | match key only |
| `Proudect Name` | New display name | `name` |
| `Proudect Model Number` | New model number | `model` |
| `Saco SKU` | Primary SKU component | part of `sku` |
| `Extra SKU` | Secondary SKU component | part of `sku` |
| `RSP` | New selling price | `price` |

Blank rows are ignored but counted separately. The second worksheet is ignored and reported in metadata.

## Exact Product Matching

Normalize the workbook lookup value and database product name by:

1. converting to text;
2. trimming leading and trailing whitespace;
3. collapsing consecutive whitespace to one space;
4. comparing case-insensitively.

Matching is exact after normalization. It is not substring, fuzzy, model, SKU, category, or brand matching.

Every active database product with the normalized name in the authenticated project is included. A row with two or three exact matches proposes the same update for each matched product and reports every product ID separately.

## SKU Construction

The stored `sku` value is built in this order:

`SACO SKU - Extra SKU`

For each component:

- preserve identifiers as trimmed text, including leading zeroes;
- treat case-insensitive variants of `Not in RSP's`, `Not Active`, `Not ACTV`, `Inactive`, `N/A`, and `NA` as inactive placeholders and omit them;
- omit blank values;
- if both usable components are equal after case-insensitive trimming, store the value once;
- join two different usable components with ` - `;
- if one component is usable, store that component only;
- if neither component is usable, propose `null` for `sku` and explicitly report why both components were omitted.

Examples from the supplied workbook:

- SACO `111521`, Extra `100487287` becomes `111521 - 100487287`.
- SACO `115738`, Extra `Not in RSP's` becomes `115738`.
- SACO `Not Active`, Extra `100527248` becomes `100527248`.
- SACO `12345`, Extra `12345` becomes `12345`.

## Validation

The import validates the entire input before a real write:

- file exists and is a supported `.xlsx` workbook;
- first worksheet exists;
- required headers exist;
- `system item name`, new product name, and model are non-empty text;
- RSP is a finite non-negative number and must not be silently converted to zero when invalid or missing;
- SKU cells are treated as identifiers, not arithmetic values;
- every proposed target product name is checked for project-level uniqueness conflicts;
- a database product cannot receive conflicting payloads from different workbook rows.

Identical duplicate workbook rows are reported. They do not cause the same product to be written twice. If multiple workbook rows resolve to the same product with different proposed values, the row status is `conflict`, and `dryRun=false` rejects the full import before writing.

Unmatched rows do not create products. They are reported as `not_found`. For `dryRun=false`, unmatched rows are skipped while valid matched updates may proceed, but any invalid or conflicting row rejects the import before the transaction starts.

## Dry-Run Response

When `dryRun=true`, the service performs all parsing, matching, validation, conflict detection, and diff calculation without calling repository save/update methods and without opening a write transaction. The response includes `dryRun: true` and `databaseChanges: 0`.

Top-level response fields:

- file and worksheet metadata;
- authenticated project ID and name;
- total worksheet rows, input rows, blank rows, and ignored worksheets;
- counts for `matched`, `multiple_matches`, `unchanged`, `not_found`, `invalid`, `conflict`, and duplicate spreadsheet rows;
- total matched database products;
- total products that would change;
- total field changes by `name`, `model`, `sku`, and `price`;
- `databaseChanges: 0`;
- `rows`, containing one entry for every non-blank input row.

Each row detail contains:

- Excel row number;
- original `system item name`;
- normalized match key;
- parsed workbook values;
- original SACO SKU and Extra SKU text;
- final combined SKU;
- ignored SKU components with the source column, original value, and reason;
- status: `matched`, `multiple_matches`, `unchanged`, `not_found`, `invalid`, or `conflict`;
- duplicate source row references, when applicable;
- validation errors and warnings;
- match count;
- `products`, with one entry for every exact database match.

Each matched product detail contains:

- product ID;
- current values for `name`, `model`, `sku`, and `price`;
- proposed values for the same fields;
- a `changes` array containing only changed fields with `field`, `before`, and `after`;
- `wouldUpdate`, which is `true` only when at least one field differs.

This detail is returned for unchanged products as well, so the dry run accounts for every row and every exact match.

## Real Import Behavior

When `dryRun=false`:

1. parse, normalize, match, validate, and build the same preview plan;
2. reject the request without writes if any row is invalid or conflicting;
3. start one transaction;
4. re-read each targeted product by ID and authenticated project ID inside the transaction;
5. apply only the four proposed fields and only when they differ;
6. update each product ID at most once;
7. commit only when all updates succeed;
8. roll back the complete import on any unexpected or database error.

The response uses the same detail structure plus `dryRun: false`, the number of committed products, and the number of committed field changes. Unmatched and unchanged rows remain visible in the response.

## Components

- A focused parser converts the supplied worksheet into typed catalog update rows and preserves Excel row numbers.
- Pure normalization and SKU helpers implement exact matching and deterministic field mapping.
- The product service builds a complete preview plan from parsed rows and project-scoped product records.
- The product service applies an already validated plan inside one transaction when explicitly requested.
- The controller handles upload validation, token-scoped project resolution, the dry-run query, and temporary-file cleanup.

No new dependency is required. The implementation uses the project's existing NestJS, TypeORM, and ExcelJS packages.

## Error Handling and Observability

Expected workbook problems are returned as structured row errors in the dry-run details. Unsupported files, missing worksheets, missing headers, missing authenticated project membership, and unsafe real-import conflicts return a clear `BadRequestException` or existing authorization error without internal stack traces.

Logs contain the authenticated project ID, dry-run flag, filename, row counts, match counts, and commit/rollback result. Logs do not contain authentication tokens or complete workbook contents.

The uploaded temporary file is removed in a `finally` path for successful and failed requests.

## Testing

Tests will be written before implementation and will cover:

- parsing the supplied misspelled headers and preserving row numbers;
- exact normalized name matching limited to the authenticated project;
- no fuzzy or substring matching;
- returning and updating every duplicate database match;
- SKU ordering, inactive placeholder omission, equality deduplication, and null result;
- typed price parsing and invalid/missing price rejection;
- detailed dry-run output for changed, unchanged, unmatched, invalid, multiple-match, duplicate-source, and conflict rows;
- proof that dry runs perform zero writes;
- identical duplicate input rows producing one write per product;
- conflicting input rows blocking the real import;
- real imports updating only name, model, SKU, and price;
- transaction rollback when an update fails;
- controller defaulting to dry run and ignoring client-supplied project identifiers.

Verification will run the focused Jest tests, the complete Jest suite, lint/type checks available in the repository, and the production build. The supplied workbook will also be parsed through the finished dry-run path; a live database dry run will be reported separately if the configured database is accessible.

## Alternatives Considered

### Modify the existing generic update importer

Rejected because it can create products, categories, brands, stock assignments, and image files. Changing it would risk existing clients and makes a no-write dry run harder to prove.

### One-off command-line script

Rejected because it would bypass the application's login-token project scope and permission model, and it would not provide a reusable API dry run.

### Dedicated update-only endpoint

Chosen because it preserves existing APIs, makes tenant scoping explicit, supports a complete preview, and limits writes to the requested fields.

## Deployment and Rollback

No schema migration or environment variable is required. Deployment adds one backward-compatible endpoint. Rollback is the removal of the new route, parser, service methods, and tests. A completed real import changes product data and would require a separately generated reverse update if business users need to undo it; the dry-run review is therefore the required operational step before `dryRun=false`.
