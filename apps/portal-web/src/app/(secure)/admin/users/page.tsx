import {
  flattenDepartments,
  getAdminUserRegistry,
  getDepartmentTree,
  listPositions,
  listRoles,
} from "@/lib/admin";
import {
  assignUserPositionAction,
  assignUserRoleAction,
  createAdminUserAction,
  offboardAdminUserAction,
  revokeUserRoleAssignmentAction,
  vacateUserPositionAction,
} from "./actions";
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

type UsersPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

function clearanceLabel(level: number) {
  switch (level) {
    case 0:
      return "Public";
    case 1:
      return "Internal";
    case 2:
      return "Confidential";
    case 3:
      return "Secret";
    default:
      return String(level);
  }
}

function assignmentTypeLabel(type: string) {
  switch (type) {
    case "primary":
      return "Primary";
    case "acting":
      return "Acting";
    case "concurrent":
      return "Concurrent";
    default:
      return type;
  }
}

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const [users, roles, departmentTree, positions] = await Promise.all([
    getAdminUserRegistry(query),
    listRoles(),
    getDepartmentTree(),
    listPositions(),
  ]);
  const departments = flattenDepartments(departmentTree);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,242,252,0.88))]">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Users</Badge>
            <div className="space-y-3">
              <CardTitle className="font-display text-4xl leading-tight">User registry</CardTitle>
              <CardDescription className="max-w-2xl text-base">
                Search, provision, and manage role and position assignments for portal operators.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row" method="get">
              <Input
                className="flex-1"
                defaultValue={query}
                name="q"
                placeholder="Search by display name or email"
              />
              <Button type="submit">Search</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-[linear-gradient(180deg,rgba(13,27,47,0.94),rgba(19,46,78,0.9))] text-white">
          <CardHeader>
            <CardDescription className="text-white/60">Registry summary</CardDescription>
            <CardTitle className="font-display text-3xl text-white">
              {users.total} profile{users.total === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-white/70">
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              Roles available: {roles.length}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              Positions available: {positions.length}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              Departments in tree: {departments.length}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Create user</CardTitle>
            <CardDescription>Provision a new operator profile and initial credential.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createAdminUserAction} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  First name
                  <Input name="firstName" required />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Last name
                  <Input name="lastName" required />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Middle name
                  <Input name="middleName" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Display name
                  <Input name="displayName" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Username
                  <Input name="username" required />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Email
                  <Input name="email" required type="email" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Password
                  <Input minLength={12} name="password" required type="password" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Phone
                  <Input name="phone" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground md:col-span-2">
                  Clearance
                  <select
                    className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                    defaultValue="1"
                    name="clearanceLevel"
                  >
                    <option value="0">Public</option>
                    <option value="1">Internal</option>
                    <option value="2">Confidential</option>
                    <option value="3">Secret</option>
                  </select>
                </label>
              </div>
              <Button className="w-fit" type="submit">
                Create user
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Profiles, roles, and positions</CardTitle>
            <CardDescription>Live registry of effective operator assignments.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {users.items.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No users found.
                </li>
              ) : (
                users.items.map((user) => {
                  const roleAssignments = user.roleAssignments;
                  const positionAssignments = user.positionAssignments;

                  return (
                    <li className="rounded-[28px] border border-border/70 bg-white/70 p-5" key={user.id}>
                      <div className="space-y-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <p className="font-semibold text-foreground">{user.displayName}</p>
                            <p className="text-sm text-muted-foreground">
                              {user.email} · {clearanceLabel(user.clearanceLevel)} · {user.status}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant={user.status === "active" ? "secondary" : "outline"}>
                              {user.status}
                            </Badge>
                            {user.status === "active" ? (
                              <form action={offboardAdminUserAction}>
                                <input name="userId" type="hidden" value={user.id} />
                                <Button type="submit" variant="secondary">
                                  Offboard
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid gap-5 xl:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-foreground">Assigned roles</p>
                              {roleAssignments.length === 0 ? (
                                <p className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                                  No active role assignments.
                                </p>
                              ) : (
                                <ul className="space-y-3">
                                  {roleAssignments.map((assignment) => (
                                    <li
                                      className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-white/70 p-4 md:flex-row md:items-start md:justify-between"
                                      key={assignment.id}
                                    >
                                      <div className="space-y-2">
                                        <p className="font-semibold text-foreground">{assignment.roleName}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {assignment.departmentScopeId
                                            ? `department ${assignment.departmentScopeId}`
                                            : "global scope"}
                                          {assignment.expiresAt ? ` · expires ${assignment.expiresAt}` : ""}
                                        </p>
                                      </div>
                                      <form action={revokeUserRoleAssignmentAction}>
                                        <input name="credentialId" type="hidden" value={user.credentialId} />
                                        <input name="assignmentId" type="hidden" value={assignment.id} />
                                        <Button type="submit" variant="secondary">
                                          Revoke
                                        </Button>
                                      </form>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <form action={assignUserRoleAction} className="grid gap-4 rounded-3xl border border-border/70 bg-background/70 p-4">
                              <input name="credentialId" type="hidden" value={user.credentialId} />
                              <div className="grid gap-4 md:grid-cols-2">
                                <label className="grid gap-2 text-sm font-medium text-foreground">
                                  Role
                                  <select
                                    className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                                    defaultValue=""
                                    name="roleId"
                                    required
                                  >
                                    <option value="">Select role</option>
                                    {roles.map((role) => (
                                      <option key={role.id} value={role.id}>
                                        {role.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="grid gap-2 text-sm font-medium text-foreground">
                                  Department scope
                                  <select
                                    className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                                    defaultValue=""
                                    name="departmentScopeId"
                                  >
                                    <option value="">Global scope</option>
                                    {departments.map((department) => (
                                      <option key={department.id} value={department.id}>
                                        {"".padStart(department.depth * 2, " ")}
                                        {department.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="grid gap-2 text-sm font-medium text-foreground md:col-span-2">
                                  Expires at
                                  <Input name="expiresAt" type="datetime-local" />
                                </label>
                              </div>
                              <Button className="w-fit" type="submit">
                                Assign role
                              </Button>
                            </form>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-foreground">Position assignments</p>
                              {positionAssignments.length === 0 ? (
                                <p className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                                  No active position assignments.
                                </p>
                              ) : (
                                <ul className="space-y-3">
                                  {positionAssignments.map((assignment) => (
                                    <li
                                      className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-white/70 p-4 md:flex-row md:items-start md:justify-between"
                                      key={assignment.id}
                                    >
                                      <div className="space-y-2">
                                        <p className="font-semibold text-foreground">
                                          {assignment.positionTitle ?? assignment.positionId}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          {assignmentTypeLabel(assignment.type)}
                                          {assignment.departmentName ? ` · ${assignment.departmentName}` : ""}
                                          {assignment.notes ? ` · ${assignment.notes}` : ""}
                                        </p>
                                      </div>
                                      <form action={vacateUserPositionAction}>
                                        <input name="userId" type="hidden" value={user.id} />
                                        <input name="positionId" type="hidden" value={assignment.positionId} />
                                        <Button type="submit" variant="secondary">
                                          Vacate
                                        </Button>
                                      </form>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <form action={assignUserPositionAction} className="grid gap-4 rounded-3xl border border-border/70 bg-background/70 p-4">
                              <input name="userId" type="hidden" value={user.id} />
                              <div className="grid gap-4 md:grid-cols-2">
                                <label className="grid gap-2 text-sm font-medium text-foreground">
                                  Position
                                  <select
                                    className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                                    defaultValue=""
                                    name="positionId"
                                    required
                                  >
                                    <option value="">Select position</option>
                                    {positions.map((position) => (
                                      <option key={position.id} value={position.id}>
                                        {position.title}
                                        {position.departmentName ? ` · ${position.departmentName}` : ""}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="grid gap-2 text-sm font-medium text-foreground">
                                  Assignment type
                                  <select
                                    className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                                    defaultValue="primary"
                                    name="type"
                                  >
                                    <option value="primary">Primary</option>
                                    <option value="acting">Acting</option>
                                    <option value="concurrent">Concurrent</option>
                                  </select>
                                </label>
                                <label className="grid gap-2 text-sm font-medium text-foreground">
                                  Effective at
                                  <Input name="assignedAt" type="datetime-local" />
                                </label>
                                <label className="grid gap-2 text-sm font-medium text-foreground">
                                  Notes
                                  <Input name="notes" />
                                </label>
                              </div>
                              <Button className="w-fit" type="submit">
                                Assign position
                              </Button>
                            </form>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
