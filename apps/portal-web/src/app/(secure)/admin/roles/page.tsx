import { createRoleAction, deleteRoleAction } from "./actions";
import { listCapabilities, listRoles } from "@/lib/admin";
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

export default async function AdminRolesPage() {
  const [roles, capabilities] = await Promise.all([listRoles(), listCapabilities()]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <Badge className="w-fit">Roles</Badge>
            <CardTitle className="font-display text-3xl">Authorization roles</CardTitle>
            <CardDescription>
              Manage capability bundles and the inheritance model used by the portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {roles.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No roles defined.
                </li>
              ) : (
                roles.map((role) => (
                  <li
                    className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-white/70 p-4 md:flex-row md:items-start md:justify-between"
                    key={role.id}
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{role.name}</p>
                        {role.isSystemRole ? <Badge variant="outline">system</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {role.description ?? "No description"} · {role.permissions.length} permissions
                      </p>
                      {role.permissions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {role.permissions.slice(0, 8).map((permission) => (
                            <Badge key={permission} variant="secondary">
                              {permission}
                            </Badge>
                          ))}
                          {role.permissions.length > 8 ? (
                            <Badge variant="outline">+{role.permissions.length - 8} more</Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {!role.isSystemRole ? (
                      <form action={deleteRoleAction}>
                        <input name="roleId" type="hidden" value={role.id} />
                        <Button type="submit" variant="secondary">
                          Delete
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-3xl">Create role</CardTitle>
            <CardDescription>
              Define a new role, optional parent inheritance, and its capability set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createRoleAction} className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Name
                <Input name="name" required />
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Description
                <Input name="description" />
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Parent role
                <select
                  className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                  defaultValue=""
                  name="parentRoleId"
                >
                  <option value="">No parent</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 rounded-3xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-medium text-foreground">Capabilities</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {capabilities.map((capability) => (
                    <label
                      className="flex items-center gap-3 rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground"
                      key={capability}
                    >
                      <input
                        className="size-4 accent-[var(--primary)]"
                        name="permissionNames"
                        type="checkbox"
                        value={capability}
                      />
                      <span>{capability}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button className="w-fit" type="submit">
                Create role
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
