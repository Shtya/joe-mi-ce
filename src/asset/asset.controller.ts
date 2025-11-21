import { Controller, Post, UseGuards, UploadedFile, UploadedFiles, UseInterceptors, Req, Body, Delete, Param, Get, Patch, NotFoundException, Query } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { multerOptions } from 'common/multer.config';
import { CreateAssetDto, UpdateAssetDto } from 'dto/assets.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { AssetService } from './asset.service';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';

@Controller('assets')
@UseGuards(AuthGuard)
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @Post()
  @Permissions(EPermission.ASSET_CREATE)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async upload(@UploadedFile() file: any, @Body() dto: CreateAssetDto, @Req() req: any) {
    return this.assetService.Create(dto, file, req.user);
  }

  @Post('bulk')
  @Permissions(EPermission.ASSET_CREATE)
  @UseInterceptors(FilesInterceptor('files', 20, multerOptions))
  async uploadMultiple(@UploadedFiles() files: any[], @Body() dto: CreateAssetDto, @Req() req: any) {
    if (!files?.length) throw new NotFoundException('No files uploaded');

    const assets = await Promise.all(files.map(file => this.assetService.Create(dto, file, req.user)));

    return {
      message: 'Assets uploaded successfully',
      assets,
    };
  }

  @Get()
  @Permissions(EPermission.ASSET_READ)
  async getUserAssets(@Req() req: any, @Query() query) {
    const { page, limit, search, sortBy, category, type, sortOrder } = query;
    return this.assetService.findAll(
      'files',
      search,
      page,
      limit,
      sortBy,
      sortOrder,
      [],
      ['user'], // relations
      ['name'],
      // { user: { id: req.user.id  }  , category, type },
    );
  }

  @Get(':id')
  @Permissions(EPermission.ASSET_READ)
  async getAsset(@Param('id') id: string) {
    return this.assetService.findOne(id);
  }

  @Patch(':id')
  @Permissions(EPermission.ASSET_UPDATE)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async updateAsset(@Param('id') id: string, @UploadedFile() file: any, @Body() dto: UpdateAssetDto) {
    return this.assetService.update(id, dto, file);
  }

  @Delete(':id')
  @Permissions(EPermission.ASSET_DELETE)
  async deleteAsset(@Param('id') id: string) {
    return this.assetService.delete(id);
  }
}
