import { createDepartmentAction } from "./actions";
import { flattenDepartments, getDepartmentTree } from "@/lib/admin";

function DepartmentTree({ nodes, depth = 0 }: { nodes: Awaited<ReturnType<typeof getDepartmentTree>>; depth?: number }) {
  return (
    <ul className="portal-list admin-tree-list">
      {nodes.map((node) => (
        <li key={node.id} style={{ marginLeft: depth * 18 }}>
          <strong>{node.name}</strong>
          <p className="portal-note">{node.code} · {node.isActive ? "active" : "inactive"}</p>
          {node.children.length > 0 ? (
            <DepartmentTree depth={depth + 1} nodes={node.children} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function AdminDepartmentsPage() {
  const tree = await getDepartmentTree();
  const flat = flattenDepartments(tree);

  return (
    <div className="portal-stack">
      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <div>
              <span className="portal-pill">Departments</span>
              <h2>Hierarchy</h2>
            </div>
          </div>
          {tree.length === 0 ? <p className="portal-note">No departments configured.</p> : <DepartmentTree nodes={tree} />}
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Create department</h2>
          </div>
          <form action={createDepartmentAction} className="portal-form">
            <label>
              Name
              <input className="portal-input" name="name" required />
            </label>
            <label>
              Code
              <input className="portal-input" name="code" required />
            </label>
            <label>
              Parent department
              <select className="portal-input" defaultValue="" name="parentDepartmentId">
                <option value="">Root</option>
                {flat.map((department) => (
                  <option key={department.id} value={department.id}>
                    {"  ".repeat(department.depth)}
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="portal-button" type="submit">
              Create department
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
