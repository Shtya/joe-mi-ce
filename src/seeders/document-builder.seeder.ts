import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource, DeepPartial } from 'typeorm';
import { DocumentBuilder, DocumentElement } from '../../entities/documentbuilder.entity';
import { TaskField } from '../../entities/documentbuilder.entity';

export const seedDocumentBuilder = async (dataSource: DataSource) => {
    const documentBuilderRepository = dataSource.getRepository(DocumentBuilder);
    const documentElementRepository = dataSource.getRepository(DocumentElement);

    console.log('🚀 Seeding document builder...');

    // Clean up
    await documentElementRepository.delete({});
    await documentBuilderRepository.delete({});

    const payload = {
    "paperSize": {
        "width": 210,
        "height": 297
    },
    "elements": [
        {
            "id": "element-1769267795047",
            "type": "field",
            "x": 483,
            "y": 10,
            "width": 284,
            "height": 40,
            "rotation": 0,
            "content": "",
            "fieldKey": "company_name_ar",
            "fieldDisplayType": "text",
            "fieldLabelStyle": {
                "color": "#1e40af",
                "fontSize": 14,
                "fontWeight": "600"
            },
            "fieldValueStyle": {
                "color": "#94a3b8",
                "fontSize": 14,
                "fontWeight": "400"
            }
        },
        {
            "id": "element-1769267801654",
            "type": "field",
            "x": 488,
            "y": 54,
            "width": 284,
            "height": 40,
            "rotation": 0,
            "content": "",
            "fieldKey": "company_name_en",
            "fieldDisplayType": "text",
            "fieldLabelStyle": {
                "color": "#1e40af",
                "fontSize": 14,
                "fontWeight": "600"
            },
            "fieldValueStyle": {
                "color": "#94a3b8",
                "fontSize": 14,
                "fontWeight": "400"
            }
        },
        {
            "id": "element-1769267809946",
            "type": "image",
            "x": 34,
            "y": 15,
            "width": 150,
            "height": 150,
            "rotation": 0,
            "content": "",
            "imageUrl": "",
            "fieldKey": "image"
        },
        {
            "id": "element-1769267863091",
            "type": "table",
            "x": 26,
            "y": 508,
            "width": 759,
            "height": 100,
            "rotation": 0,
            "content": "",
            "tableData": {
                "rows": 1,
                "cols": 4,
                "cells": [
                    [
                        "ساكو",
                        "مصرى",
                        "6555988888",
                        "احمد محمد فوزى"
                    ]
                ],
                "columnFields": [
                    "work_location",
                    "employee_nationality",
                    "employee_identity_number",
                    "employee_full_name",
                    null,
                    null,
                    "work_location"
                ],
                "columnLabels": [
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
                ],
                "headerBackgroundColor": "#f3f4f6",
                "headerTextColor": "#000000",
                "cellBackgroundColor": "#ffffff",
                "cellTextColor": "#000000",
                "fontSize": 14
            }
        },
        {
            "id": "element-1769267976165",
            "type": "line",
            "x": 472,
            "y": 81,
            "width": 286,
            "height": 2,
            "rotation": 0,
            "content": "",
            "lineStyle": "solid",
            "lineOrientation": "horizontal",
            "lineWidth": 2
        },
        {
            "id": "element-1769268077475",
            "type": "field",
            "x": 540,
            "y": 94,
            "width": 225,
            "height": 40,
            "rotation": 0,
            "content": "",
            "fieldKey": "vat_number",
            "fieldDisplayType": "text",
            "fieldLabelStyle": {
                "color": "#1e40af",
                "fontSize": 14,
                "fontWeight": "600"
            },
            "fieldValueStyle": {
                "color": "#94a3b8",
                "fontSize": 14,
                "fontWeight": "400"
            }
        },
        {
            "id": "element-1769268200640",
            "type": "field",
            "x": 495,
            "y": 178,
            "width": 263,
            "height": 40,
            "rotation": 0,
            "content": "",
            "fieldKey": "recipient_name",
            "fieldDisplayType": "text",
            "fieldLabelStyle": {
                "color": "#1e40af",
                "fontSize": 14,
                "fontWeight": "600"
            },
            "fieldValueStyle": {
                "color": "#94a3b8",
                "fontSize": 14,
                "fontWeight": "400"
            }
        },
        {
            "id": "element-1769268234649",
            "type": "field",
            "x": 514,
            "y": 227,
            "width": 216,
            "height": 40,
            "rotation": 0,
            "content": "",
            "fieldKey": "greeting_text",
            "fieldDisplayType": "text",
            "fieldLabelStyle": {
                "color": "#1e40af",
                "fontSize": 14,
                "fontWeight": "600"
            },
            "fieldValueStyle": {
                "color": "#94a3b8",
                "fontSize": 14,
                "fontWeight": "400"
            }
        },
        {
            "id": "element-1769268259461",
            "type": "field",
            "x": 28,
            "y": 274,
            "width": 734,
            "height": 200,
            "rotation": 0,
            "content": "",
            "fieldKey": "body_text",
            "fieldDisplayType": "text",
            "fieldLabelStyle": {
                "color": "#1e40af",
                "fontSize": 14,
                "fontWeight": "600"
            },
            "fieldValueStyle": {
                "color": "#94a3b8",
                "fontSize": 14,
                "fontWeight": "400"
            }
        },
        {
            "id": "element-1769268843410",
            "type": "field",
            "x": 48,
            "y": 723,
            "width": 251,
            "height": 40,
            "rotation": 0,
            "content": "",
            "fieldKey": "closing_text",
            "fieldDisplayType": "text",
            "fieldLabelStyle": {
                "color": "#1e40af",
                "fontSize": 14,
                "fontWeight": "600"
            },
            "fieldValueStyle": {
                "color": "#94a3b8",
                "fontSize": 14,
                "fontWeight": "400"
            }
        },
        {
            "id": "element-1769268878646",
            "type": "field",
            "x": 58,
            "y": 794,
            "width": 228,
            "height": 40,
            "rotation": 0,
            "content": "",
            "fieldKey": "company_stamp",
            "fieldDisplayType": "text",
            "fieldLabelStyle": {
                "color": "#1e40af",
                "fontSize": 14,
                "fontWeight": "600"
            },
            "fieldValueStyle": {
                "color": "#94a3b8",
                "fontSize": 14,
                "fontWeight": "400"
            }
        }
    ],
    "taskData": null,
    "timestamp": "2026-01-24T15:35:45.144Z"
    };

    console.log('Inserting DocumentBuilder...');
    const doc = new DocumentBuilder();
    doc.paperSize = payload.paperSize;
    doc.taskData = payload.taskData;
    doc.timestamp = new Date(payload.timestamp);
    doc.isMain = true;
    
    // Save doc first to get ID (though with cascade we might be able to save all at once, better to be safe)
    const savedDoc = await documentBuilderRepository.save(doc);

    const elementsData = payload.elements.map(el => {
        const elem = new DocumentElement();
        // Use object.assign or manual assignment. Be explicit to match types.
        elem.type = el.type;
        elem.x = el.x;
        elem.y = el.y;
        elem.width = el.width;
        elem.height = el.height;
        elem.rotation = el.rotation;
        
        // Optional properties
        if (el.content !== undefined) elem.content = el.content;
        if ('imageUrl' in el) elem.imageUrl = (el as any).imageUrl;
        if ('fieldKey' in el) elem.fieldKey = (el as any).fieldKey;
        if ('fieldDisplayType' in el) elem.fieldDisplayType = (el as any).fieldDisplayType;
        if ('fieldLabelStyle' in el) elem.fieldLabelStyle = (el as any).fieldLabelStyle;
        if ('fieldValueStyle' in el) elem.fieldValueStyle = (el as any).fieldValueStyle;
        if ('tableData' in el) elem.tableData = (el as any).tableData;
        if ('lineStyle' in el) elem.lineStyle = (el as any).lineStyle;
        if ('lineOrientation' in el) elem.lineOrientation = (el as any).lineOrientation;
        if ('lineWidth' in el) elem.lineWidth = (el as any).lineWidth;

        elem.documentBuilder = savedDoc;
        return elem;
    });

    await documentElementRepository.save(elementsData);

    console.log(`✅ Seeded Document (ID: ${savedDoc.id}) and ${elementsData.length} elements`);

    // Verify
    const verification = await documentBuilderRepository.findOne({
        where: { id: savedDoc.id },
        relations: { elements: true }
    });
    
    console.log('Verification Output:');
    console.log(JSON.stringify(verification, null, 2));
};

if (require.main === module) {
  const dbConfig = {
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
    synchronize: true,
  };
  console.log('DB Config:', JSON.stringify({ ...dbConfig, password: '***' }, null, 2));

  const dataSource = new DataSource(dbConfig as any);

  dataSource
    .initialize()
    .then(async () => {
      await seedDocumentBuilder(dataSource);
      await dataSource.destroy();
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Document Builder seeding failed:', err);
      process.exit(1);
    });
}
