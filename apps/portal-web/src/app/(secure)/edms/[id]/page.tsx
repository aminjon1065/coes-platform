import Link from "next/link";
import { getDocumentDetailData, getPositionOptions } from "@/lib/edms";
import {
  actOnWorkflowStepAction,
  addAttachmentAction,
  fileCompletionReportAction,
  issueResolutionAction,
  registerDocumentAction,
  removeAttachmentAction,
  resumeWorkflowAction,
  startWorkflowAction,
  transitionDocumentAction,
  updateDocumentAction,
} from "./actions";

const DOCUMENT_TRANSITIONS: Record<string, string[]> = {
  draft: ["registered", "cancelled"],
  registered: ["in_workflow", "completed", "cancelled"],
  in_workflow: ["completed", "registered", "cancelled"],
  completed: ["archived"],
  archived: [],
  cancelled: [],
};

const WORKFLOW_ACTIONS = [
  "reviewed",
  "endorsed",
  "endorsed_conditionally",
  "approved",
  "rejected",
  "signed",
  "resolution_issued",
  "distributed",
  "acknowledged",
  "returned",
];

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB");
}

function formatRecipientsValue(
  recipients: Array<{ name: string; type: "internal" | "external"; positionId: string | null }>,
) {
  return recipients
    .map((recipient) =>
      [recipient.name, recipient.type, recipient.positionId ?? ""].join("|"),
    )
    .join("\n");
}

type DocumentDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentDetailPage({ params }: DocumentDetailPageProps) {
  const { id } = await params;
  const [document, positions] = await Promise.all([
    getDocumentDetailData(id),
    getPositionOptions(),
  ]);
  const availableTransitions = DOCUMENT_TRANSITIONS[document.status] ?? [];
  const isDraft = document.status === "draft";

  return (
    <div className="portal-stack">
      <nav className="portal-note">
        <Link href="/edms">Documents</Link> / {document.title}
      </nav>

      <section className="portal-panel">
        <div className="portal-row">
          <div>
            <span className="portal-pill">{document.status}</span>
            <h2>{document.title}</h2>
            <p className="portal-note">
              {document.registrationNumber ?? "Unregistered"} · {document.typeName} ·{" "}
              {document.direction}
            </p>
          </div>
          <div className="portal-metadata">
            <span>Class {document.classification}</span>
            <span>Updated {formatDateTime(document.updatedAt)}</span>
            <span>Created {formatDateTime(document.createdAt)}</span>
          </div>
        </div>
        {document.body ? <p>{document.body}</p> : null}
        <p className="portal-note">
          Created by {document.createdById} · deadline {formatDateTime(document.deadline)}
        </p>
        {document.retentionReviewDate ? (
          <p className="portal-note">
            Retention review {formatDateTime(document.retentionReviewDate)}
          </p>
        ) : null}
      </section>

      {isDraft ? (
        <section className="portal-panel">
          <div className="portal-section-head">
            <h2>Edit draft</h2>
          </div>
          <form action={updateDocumentAction} className="portal-form">
            <input name="documentId" type="hidden" value={document.id} />
            <div className="portal-columns">
              <label>
                Subject
                <input className="portal-input" defaultValue={document.title} name="subject" required />
              </label>
              <label>
                Classification
                <input
                  className="portal-input"
                  defaultValue={document.classification}
                  max={3}
                  min={0}
                  name="classification"
                  type="number"
                />
              </label>
              <label>
                Sender position
                <select className="portal-input" defaultValue={document.senderPositionId ?? ""} name="senderPositionId">
                  <option value="">Not set</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.title}
                      {position.departmentName ? ` (${position.departmentName})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sender name
                <input className="portal-input" defaultValue={document.senderName ?? ""} name="senderName" />
              </label>
              <label>
                External ref number
                <input
                  className="portal-input"
                  defaultValue={document.externalRefNumber ?? ""}
                  name="externalRefNumber"
                />
              </label>
              <label>
                Document date
                <input className="portal-input" defaultValue={document.documentDate ?? ""} name="documentDate" type="date" />
              </label>
              <label>
                Deadline
                <input className="portal-input" defaultValue={document.deadline ?? ""} name="deadline" type="date" />
              </label>
              <label>
                Related document ID
                <input
                  className="portal-input"
                  defaultValue={document.relatedDocumentId ?? ""}
                  name="relatedDocumentId"
                />
              </label>
            </div>
            <label>
              Recipients
              <textarea
                className="portal-input"
                defaultValue={formatRecipientsValue(document.recipients)}
                name="recipients"
                rows={5}
              />
            </label>
            <label>
              Body
              <textarea className="portal-input" defaultValue={document.body ?? ""} name="body" rows={8} />
            </label>
            <label>
              Change reason
              <input className="portal-input" name="changeReason" />
            </label>
            <div className="portal-actions">
              <button className="portal-button" type="submit">
                Save draft
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Registration and status</h2>
          </div>
          {document.registrationNumber ? (
            <p className="portal-note">Registered as {document.registrationNumber}.</p>
          ) : (
            <form action={registerDocumentAction} className="portal-form">
              <input name="documentId" type="hidden" value={document.id} />
              <label>
                Registrar position
                <select className="portal-input" defaultValue="" name="registrarPositionId">
                  <option value="">Use active position</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.title}
                      {position.departmentName ? ` (${position.departmentName})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Document date
                <input className="portal-input" defaultValue={document.documentDate ?? ""} name="documentDate" type="date" />
              </label>
              <button className="portal-button" type="submit">
                Register document
              </button>
            </form>
          )}

          {availableTransitions.length === 0 ? (
            <p className="portal-note">No direct transitions available.</p>
          ) : (
            <form action={transitionDocumentAction} className="portal-form">
              <input name="documentId" type="hidden" value={document.id} />
              <label>
                Target status
                <select className="portal-input" defaultValue={availableTransitions[0]} name="targetStatus">
                  {availableTransitions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reason
                <textarea className="portal-input" name="reason" rows={3} />
              </label>
              <button className="portal-button" type="submit">
                Apply transition
              </button>
            </form>
          )}
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Recipients</h2>
          </div>
          <ul className="portal-list">
            {document.recipients.length === 0 ? (
              <li>No recipients.</li>
            ) : (
              document.recipients.map((recipient, index) => (
                <li key={`${recipient.name}-${index}`}>
                  <strong>{recipient.name}</strong>
                  <p className="portal-note">
                    {recipient.type}
                    {recipient.positionLabel ? ` · ${recipient.positionLabel}` : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Attachments</h2>
          </div>
          <ul className="portal-list">
            {document.attachments.length === 0 ? (
              <li>No attachments.</li>
            ) : (
              document.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <strong>{attachment.name}</strong>
                  <p className="portal-note">
                    {attachment.role} · {attachment.mimeType ?? "Unknown type"} · class{" "}
                    {attachment.classification}
                  </p>
                  <p className="portal-note">
                    fileId {attachment.fileId} · added {formatDateTime(attachment.createdAt)}
                  </p>
                  <form action={removeAttachmentAction}>
                    <input name="documentId" type="hidden" value={document.id} />
                    <input name="attachmentId" type="hidden" value={attachment.id} />
                    <button className="portal-button secondary" type="submit">
                      Remove attachment
                    </button>
                  </form>
                </li>
              ))
            )}
          </ul>

          <form action={addAttachmentAction} className="portal-form">
            <input name="documentId" type="hidden" value={document.id} />
            <label>
              File ID
              <input className="portal-input" name="fileId" required />
            </label>
            <label>
              Filename
              <input className="portal-input" name="filename" required />
            </label>
            <div className="portal-columns portal-columns-tight">
              <label>
                Role
                <select className="portal-input" defaultValue="supporting" name="role">
                  <option value="primary_body">primary_body</option>
                  <option value="annex">annex</option>
                  <option value="supporting">supporting</option>
                  <option value="signature">signature</option>
                </select>
              </label>
              <label>
                Classification
                <input className="portal-input" defaultValue={document.classification} max={3} min={0} name="classification" type="number" />
              </label>
              <label>
                MIME type
                <input className="portal-input" name="mimeType" />
              </label>
              <label>
                Size bytes
                <input className="portal-input" min={0} name="fileSizeBytes" type="number" />
              </label>
            </div>
            <button className="portal-button" type="submit">
              Add attachment
            </button>
          </form>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Versions</h2>
          </div>
          <ul className="portal-list">
            {document.versions.length === 0 ? (
              <li>No versions.</li>
            ) : (
              document.versions.map((version) => (
                <li key={version.id}>
                  <strong>v{version.versionNumber}</strong>
                  <p className="portal-note">
                    {version.authorLabel} · {formatDateTime(version.createdAt)}
                  </p>
                  {version.changeReason ? (
                    <p className="portal-note">{version.changeReason}</p>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Workflow</h2>
        </div>
        {!document.workflow ? (
          <form action={startWorkflowAction} className="portal-form">
            <input name="documentId" type="hidden" value={document.id} />
            <p className="portal-note">No active workflow instance for this document.</p>
            <button className="portal-button" type="submit">
              Start workflow
            </button>
          </form>
        ) : (
          <div className="portal-stack">
            <div className="portal-row">
              <div>
                <span className="portal-pill">{document.workflow.status}</span>
                <p className="portal-note">
                  Initiated by {document.workflow.initiatedByLabel} ·{" "}
                  {formatDateTime(document.workflow.createdAt)}
                </p>
                {document.workflow.rejectionReason ? (
                  <p className="portal-note">
                    Rejection reason: {document.workflow.rejectionReason}
                  </p>
                ) : null}
              </div>
              {document.workflow.status === "suspended" ? (
                <form action={resumeWorkflowAction}>
                  <input name="documentId" type="hidden" value={document.id} />
                  <button className="portal-button" type="submit">
                    Resume workflow
                  </button>
                </form>
              ) : null}
            </div>

            <ul className="portal-list">
              {document.workflow.steps.length === 0 ? (
                <li>No workflow steps.</li>
              ) : (
                document.workflow.steps.map((step) => (
                  <li key={step.id}>
                    <div className="portal-stack">
                      <div className="portal-row">
                        <div>
                          <strong>
                            Step {step.stepOrder}: {step.stepName}
                          </strong>
                          <p className="portal-note">
                            {step.stepType} · {step.status} · {step.positionLabel}
                          </p>
                          <p className="portal-note">
                            Deadline {formatDateTime(step.deadline)} · actor{" "}
                            {step.actorLabel ?? step.assignedUserLabel ?? "pending"}
                          </p>
                        </div>
                        <span className="portal-pill">{step.status}</span>
                      </div>
                      {step.status === "active" || step.status === "overdue" ? (
                        <form action={actOnWorkflowStepAction} className="portal-form">
                          <input name="documentId" type="hidden" value={document.id} />
                          <input name="stepId" type="hidden" value={step.id} />
                          <label>
                            Action
                            <select className="portal-input" defaultValue="reviewed" name="action">
                              {WORKFLOW_ACTIONS.map((action) => (
                                <option key={action} value={action}>
                                  {action}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Remarks
                            <textarea className="portal-input" name="remarks" rows={3} />
                          </label>
                          <label>
                            Return to step ID
                            <input className="portal-input" name="returnToStep" />
                          </label>
                          <button className="portal-button" type="submit">
                            Act on step
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>

            <div className="portal-section-head">
              <h2>Workflow history</h2>
            </div>
            <ul className="portal-list">
              {document.workflow.history.length === 0 ? (
                <li>No workflow history.</li>
              ) : (
                document.workflow.history.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.eventType}</strong>
                    <p className="portal-note">
                      {entry.actorLabel ?? "system"} · {formatDateTime(entry.createdAt)}
                    </p>
                    {entry.remarks ? <p className="portal-note">{entry.remarks}</p> : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Resolutions</h2>
        </div>
        <ul className="portal-list">
          {document.resolutions.length === 0 ? (
            <li>No resolutions issued yet.</li>
          ) : (
            document.resolutions.map((resolution) => (
              <li key={resolution.id}>
                <div className="portal-stack">
                  <div className="portal-row">
                    <div>
                      <strong>{resolution.priority}</strong>
                      <p className="portal-note">
                        {resolution.issuingUserLabel} · {resolution.issuingPositionLabel}
                      </p>
                      <p>{resolution.text}</p>
                    </div>
                    <div className="portal-metadata">
                      <span>{formatDateTime(resolution.createdAt)}</span>
                      <span>Deadline {formatDateTime(resolution.deadline)}</span>
                    </div>
                  </div>
                  <ul className="portal-list">
                    {resolution.assignments.length === 0 ? (
                      <li>No executor assignments.</li>
                    ) : (
                      resolution.assignments.map((assignment) => (
                        <li key={assignment.id}>
                          <strong>{assignment.positionLabel}</strong>
                          <p className="portal-note">
                            {assignment.executorRole} · {assignment.status}
                            {assignment.assignedUserLabel
                              ? ` · ${assignment.assignedUserLabel}`
                              : ""}
                          </p>
                          {assignment.instruction ? (
                            <p className="portal-note">{assignment.instruction}</p>
                          ) : null}
                          {assignment.linkedTaskId ? (
                            <p className="portal-note">Linked task {assignment.linkedTaskId}</p>
                          ) : null}
                          {assignment.completionReport ? (
                            <p className="portal-note">
                              Completion report: {assignment.completionReport}
                            </p>
                          ) : null}
                          {assignment.status !== "completed" &&
                          assignment.status !== "cancelled" ? (
                            <form action={fileCompletionReportAction} className="portal-form">
                              <input name="documentId" type="hidden" value={document.id} />
                              <input name="assignmentId" type="hidden" value={assignment.id} />
                              <label>
                                Completion report
                                <textarea className="portal-input" name="report" rows={3} />
                              </label>
                              <button className="portal-button secondary" type="submit">
                                File completion report
                              </button>
                            </form>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </li>
            ))
          )}
        </ul>

        <form action={issueResolutionAction} className="portal-form">
          <input name="documentId" type="hidden" value={document.id} />
          <div className="portal-columns">
            <label>
              Priority
              <select className="portal-input" defaultValue="routine" name="priority">
                <option value="routine">routine</option>
                <option value="urgent">urgent</option>
                <option value="emergency">emergency</option>
              </select>
            </label>
            <label>
              Deadline
              <input className="portal-input" name="deadline" type="date" />
            </label>
            <label>
              Workflow step ID
              <input className="portal-input" name="workflowStepId" />
            </label>
          </div>
          <label>
            Resolution text
            <textarea className="portal-input" name="text" required rows={4} />
          </label>
          <label>
            Executors
            <textarea className="portal-input" name="executors" required rows={5} />
          </label>
          <p className="portal-note">
            Executors format: <code>positionId|role|instruction|deadline</code> per line.
          </p>
          <button className="portal-button" type="submit">
            Issue resolution
          </button>
        </form>
      </section>
    </div>
  );
}
