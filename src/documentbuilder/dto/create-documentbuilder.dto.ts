export class CreateDocumentbuilderDto {
    paperSize: { width: number; height: number };
    elements: any[];
    taskData?: any;
    timestamp: string;
}
