import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WorkflowService } from '../services/workflow.service';

/**
 * Listens for EDMS domain events and triggers workflow lifecycle actions.
 */
@Injectable()
export class EdmsWorkflowListener {
  private readonly logger = new Logger(EdmsWorkflowListener.name);

  constructor(private readonly workflowService: WorkflowService) {}

  /**
   * When a document is registered, automatically start its workflow
   * if an active template exists for the document type.
   */
  @OnEvent('edms.document.registered')
  async onDocumentRegistered(payload: {
    documentId: string;
    registrationNumber: string;
    actorId: string;
  }): Promise<void> {
    try {
      await this.workflowService.startWorkflow(
        payload.documentId,
        payload.actorId,
        null,
      );
      this.logger.log(`Workflow started for document ${payload.documentId} (${payload.registrationNumber})`);
    } catch (err) {
      // Log but do not throw — workflow start failure should not fail the registration response
      this.logger.error(
        `Failed to start workflow for document ${payload.documentId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
