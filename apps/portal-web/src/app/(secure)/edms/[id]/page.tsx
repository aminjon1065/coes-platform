import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
    .map((recipient) => [recipient.name, recipient.type, recipient.positionId ?? ""].join("|"))
    .join("\n");
}

type DocumentDetailPageProps = {
  params: Promise<{ id: string }>;
};

function Select({
  children,
  defaultValue,
  name,
}: {
  children: ReactNode;
  defaultValue?: string;
  name: string;
}) {
  return (
    <select
      className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
      defaultValue={defaultValue}
      name={name}
    >
      {children}
    </select>
  );
}

export default async function DocumentDetailPage({ params }: DocumentDetailPageProps) {
  const { id } = await params;
  const [document, positions] = await Promise.all([
    getDocumentDetailData(id),
    getPositionOptions(),
  ]);
  const availableTransitions = DOCUMENT_TRANSITIONS[document.status] ?? [];
  const isDraft = document.status === "draft";

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link className="transition hover:text-foreground" href="/edms">
          Documents
        </Link>{" "}
        / {document.title}
      </nav>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{document.status}</Badge>
            <Badge variant="secondary">{document.typeName}</Badge>
            <Badge variant="secondary">{document.direction}</Badge>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="font-heading text-3xl">{document.title}</CardTitle>
              <CardDescription>
                {document.registrationNumber ?? "Unregistered"} | class {document.classification}
              </CardDescription>
            </div>
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                Updated {formatDateTime(document.updatedAt)}
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                Created {formatDateTime(document.createdAt)}
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                Deadline {formatDateTime(document.deadline)}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {document.body ? <p className="text-sm leading-7 text-foreground">{document.body}</p> : null}
          <p className="text-sm text-muted-foreground">Created by {document.createdById}</p>
          {document.retentionReviewDate ? (
            <p className="text-sm text-muted-foreground">
              Retention review {formatDateTime(document.retentionReviewDate)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {isDraft ? (
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Edit draft</CardTitle>
            <CardDescription>Update document metadata before registration or workflow start.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateDocumentAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <input name="documentId" type="hidden" value={document.id} />
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Subject</span>
                <Input defaultValue={document.title} name="subject" required />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Classification</span>
                <Input defaultValue={document.classification} max={3} min={0} name="classification" type="number" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Sender position</span>
                <Select defaultValue={document.senderPositionId ?? ""} name="senderPositionId">
                  <option value="">Not set</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.title}
                      {position.departmentName ? ` (${position.departmentName})` : ""}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Sender name</span>
                <Input defaultValue={document.senderName ?? ""} name="senderName" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>External ref number</span>
                <Input defaultValue={document.externalRefNumber ?? ""} name="externalRefNumber" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Document date</span>
                <Input defaultValue={document.documentDate ?? ""} name="documentDate" type="date" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Deadline</span>
                <Input defaultValue={document.deadline ?? ""} name="deadline" type="date" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Related document ID</span>
                <Input defaultValue={document.relatedDocumentId ?? ""} name="relatedDocumentId" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2 xl:col-span-4">
                <span>Recipients</span>
                <Textarea defaultValue={formatRecipientsValue(document.recipients)} name="recipients" rows={5} />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2 xl:col-span-4">
                <span>Body</span>
                <Textarea defaultValue={document.body ?? ""} name="body" rows={8} />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2 xl:col-span-4">
                <span>Change reason</span>
                <Input name="changeReason" />
              </label>
              <div className="md:col-span-2 xl:col-span-4">
                <Button type="submit">Save draft</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Registration and status</CardTitle>
            <CardDescription>Manage registration details and direct status transitions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {document.registrationNumber ? (
              <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                Registered as {document.registrationNumber}.
              </div>
            ) : (
              <form action={registerDocumentAction} className="grid gap-4">
                <input name="documentId" type="hidden" value={document.id} />
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Registrar position</span>
                  <Select defaultValue="" name="registrarPositionId">
                    <option value="">Use active position</option>
                    {positions.map((position) => (
                      <option key={position.id} value={position.id}>
                        {position.title}
                        {position.departmentName ? ` (${position.departmentName})` : ""}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Document date</span>
                  <Input defaultValue={document.documentDate ?? ""} name="documentDate" type="date" />
                </label>
                <Button type="submit">Register document</Button>
              </form>
            )}

            {availableTransitions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                No direct transitions available.
              </div>
            ) : (
              <form action={transitionDocumentAction} className="grid gap-4">
                <input name="documentId" type="hidden" value={document.id} />
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Target status</span>
                  <Select defaultValue={availableTransitions[0]} name="targetStatus">
                    {availableTransitions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Reason</span>
                  <Textarea name="reason" rows={3} />
                </label>
                <Button type="submit">Apply transition</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Recipients</CardTitle>
            <CardDescription>Internal and external routing for the current document.</CardDescription>
          </CardHeader>
          <CardContent>
            {document.recipients.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                No recipients.
              </div>
            ) : (
              <div className="space-y-3">
                {document.recipients.map((recipient, index) => (
                  <div key={`${recipient.name}-${index}`} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                    <p className="text-base font-semibold text-foreground">{recipient.name}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {recipient.type}
                      {recipient.positionLabel ? ` | ${recipient.positionLabel}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Attachments</CardTitle>
            <CardDescription>Maintain supporting files attached to the document.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {document.attachments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                No attachments.
              </div>
            ) : (
              <div className="space-y-3">
                {document.attachments.map((attachment) => (
                  <div key={attachment.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <p className="text-base font-semibold text-foreground">{attachment.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {attachment.role} | {attachment.mimeType ?? "Unknown type"} | class{" "}
                          {attachment.classification}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          fileId {attachment.fileId} | added {formatDateTime(attachment.createdAt)}
                        </p>
                      </div>
                      <form action={removeAttachmentAction}>
                        <input name="documentId" type="hidden" value={document.id} />
                        <input name="attachmentId" type="hidden" value={attachment.id} />
                        <Button type="submit" variant="outline">
                          Remove attachment
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form action={addAttachmentAction} className="grid gap-4 md:grid-cols-2">
              <input name="documentId" type="hidden" value={document.id} />
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>File ID</span>
                <Input name="fileId" required />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Filename</span>
                <Input name="filename" required />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Role</span>
                <Select defaultValue="supporting" name="role">
                  <option value="primary_body">primary_body</option>
                  <option value="annex">annex</option>
                  <option value="supporting">supporting</option>
                  <option value="signature">signature</option>
                </Select>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Classification</span>
                <Input defaultValue={document.classification} max={3} min={0} name="classification" type="number" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>MIME type</span>
                <Input name="mimeType" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Size bytes</span>
                <Input min={0} name="fileSizeBytes" type="number" />
              </label>
              <div className="md:col-span-2">
                <Button type="submit">Add attachment</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Versions</CardTitle>
            <CardDescription>Document revisions and change reasons.</CardDescription>
          </CardHeader>
          <CardContent>
            {document.versions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                No versions.
              </div>
            ) : (
              <div className="space-y-3">
                {document.versions.map((version) => (
                  <div key={version.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                    <p className="text-base font-semibold text-foreground">v{version.versionNumber}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {version.authorLabel} | {formatDateTime(version.createdAt)}
                    </p>
                    {version.changeReason ? (
                      <p className="mt-2 text-sm text-foreground">{version.changeReason}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Workflow</CardTitle>
          <CardDescription>Track active steps, actions, and historical workflow events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!document.workflow ? (
            <form action={startWorkflowAction} className="space-y-4">
              <input name="documentId" type="hidden" value={document.id} />
              <p className="text-sm text-muted-foreground">No active workflow instance for this document.</p>
              <Button type="submit">Start workflow</Button>
            </form>
          ) : (
            <>
              <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-background/80 p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{document.workflow.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Initiated by {document.workflow.initiatedByLabel} |{" "}
                    {formatDateTime(document.workflow.createdAt)}
                  </p>
                  {document.workflow.rejectionReason ? (
                    <p className="text-sm text-muted-foreground">
                      Rejection reason: {document.workflow.rejectionReason}
                    </p>
                  ) : null}
                </div>
                {document.workflow.status === "suspended" ? (
                  <form action={resumeWorkflowAction}>
                    <input name="documentId" type="hidden" value={document.id} />
                    <Button type="submit">Resume workflow</Button>
                  </form>
                ) : null}
              </div>

              {document.workflow.steps.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                  No workflow steps.
                </div>
              ) : (
                <div className="space-y-4">
                  {document.workflow.steps.map((step) => (
                    <div key={step.id} className="rounded-3xl border border-border/70 bg-background/80 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-foreground">
                              Step {step.stepOrder}: {step.stepName}
                            </p>
                            <Badge variant="outline">{step.status}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {step.stepType} | {step.positionLabel}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Deadline {formatDateTime(step.deadline)} | actor{" "}
                            {step.actorLabel ?? step.assignedUserLabel ?? "pending"}
                          </p>
                        </div>
                      </div>
                      {step.status === "active" || step.status === "overdue" ? (
                        <form action={actOnWorkflowStepAction} className="mt-4 grid gap-4 md:grid-cols-2">
                          <input name="documentId" type="hidden" value={document.id} />
                          <input name="stepId" type="hidden" value={step.id} />
                          <label className="space-y-2 text-sm font-medium text-foreground">
                            <span>Action</span>
                            <Select defaultValue="reviewed" name="action">
                              {WORKFLOW_ACTIONS.map((action) => (
                                <option key={action} value={action}>
                                  {action}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="space-y-2 text-sm font-medium text-foreground">
                            <span>Return to step ID</span>
                            <Input name="returnToStep" />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2">
                            <span>Remarks</span>
                            <Textarea name="remarks" rows={3} />
                          </label>
                          <div className="md:col-span-2">
                            <Button type="submit">Act on step</Button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Workflow history</h3>
                {document.workflow.history.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                    No workflow history.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {document.workflow.history.map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                        <p className="text-base font-semibold text-foreground">{entry.eventType}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {entry.actorLabel ?? "system"} | {formatDateTime(entry.createdAt)}
                        </p>
                        {entry.remarks ? (
                          <p className="mt-2 text-sm text-foreground">{entry.remarks}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Resolutions</CardTitle>
          <CardDescription>Issue executor instructions and track completion reports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {document.resolutions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
              No resolutions issued yet.
            </div>
          ) : (
            <div className="space-y-4">
              {document.resolutions.map((resolution) => (
                <div key={resolution.id} className="rounded-3xl border border-border/70 bg-background/80 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{resolution.priority}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {resolution.issuingUserLabel} | {resolution.issuingPositionLabel}
                      </p>
                      <p className="text-sm text-foreground">{resolution.text}</p>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>{formatDateTime(resolution.createdAt)}</p>
                      <p>Deadline {formatDateTime(resolution.deadline)}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {resolution.assignments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                        No executor assignments.
                      </div>
                    ) : (
                      resolution.assignments.map((assignment) => (
                        <div key={assignment.id} className="rounded-2xl border border-border/70 bg-white/70 p-4">
                          <p className="text-base font-semibold text-foreground">{assignment.positionLabel}</p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {assignment.executorRole} | {assignment.status}
                            {assignment.assignedUserLabel ? ` | ${assignment.assignedUserLabel}` : ""}
                          </p>
                          {assignment.instruction ? (
                            <p className="mt-2 text-sm text-foreground">{assignment.instruction}</p>
                          ) : null}
                          {assignment.linkedTaskId ? (
                            <p className="mt-2 text-sm text-muted-foreground">Linked task {assignment.linkedTaskId}</p>
                          ) : null}
                          {assignment.completionReport ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              Completion report: {assignment.completionReport}
                            </p>
                          ) : null}
                          {assignment.status !== "completed" && assignment.status !== "cancelled" ? (
                            <form action={fileCompletionReportAction} className="mt-4 space-y-3">
                              <input name="documentId" type="hidden" value={document.id} />
                              <input name="assignmentId" type="hidden" value={assignment.id} />
                              <label className="space-y-2 text-sm font-medium text-foreground">
                                <span>Completion report</span>
                                <Textarea name="report" rows={3} />
                              </label>
                              <Button type="submit" variant="outline">
                                File completion report
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form action={issueResolutionAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <input name="documentId" type="hidden" value={document.id} />
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Priority</span>
              <Select defaultValue="routine" name="priority">
                <option value="routine">routine</option>
                <option value="urgent">urgent</option>
                <option value="emergency">emergency</option>
              </Select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Deadline</span>
              <Input name="deadline" type="date" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Workflow step ID</span>
              <Input name="workflowStepId" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2 xl:col-span-3">
              <span>Resolution text</span>
              <Textarea name="text" required rows={4} />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2 xl:col-span-3">
              <span>Executors</span>
              <Textarea name="executors" required rows={5} />
            </label>
            <p className="md:col-span-2 xl:col-span-3 text-sm text-muted-foreground">
              Executors format: <code>positionId|role|instruction|deadline</code> per line.
            </p>
            <div className="md:col-span-2 xl:col-span-3">
              <Button type="submit">Issue resolution</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
