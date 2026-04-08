import { createPositionAction } from "./actions";
import { flattenDepartments, getDepartmentTree, listPositions } from "@/lib/admin";

const POSITION_LEVELS = [
  "chairman",
  "deputy_chairman",
  "department_head",
  "deputy_head",
  "division_head",
  "senior_specialist",
  "specialist",
  "analyst",
  "operator",
  "clerk",
] as const;

export default async function AdminPositionsPage() {
  const [positions, departmentTree] = await Promise.all([
    listPositions(),
    getDepartmentTree(),
  ]);
  const departments = flattenDepartments(departmentTree);

  return (
    <div className="portal-stack">
      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <div>
              <span className="portal-pill">Positions</span>
              <h2>Registry</h2>
            </div>
          </div>
          <ul className="portal-list">
            {positions.length === 0 ? (
              <li>No positions configured.</li>
            ) : (
              positions.map((position) => (
                <li key={position.id}>
                  <strong>{position.title}</strong>
                  <p className="portal-note">
                    {position.departmentName ?? position.departmentId} · {position.level}
                  </p>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Create position</h2>
          </div>
          <form action={createPositionAction} className="portal-form">
            <label>
              Title
              <input className="portal-input" name="title" required />
            </label>
            <label>
              Level
              <select className="portal-input" defaultValue={POSITION_LEVELS[2]} name="level">
                {POSITION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Department
              <select className="portal-input" defaultValue="" name="departmentId">
                <option value="" disabled>
                  Select department
                </option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {"  ".repeat(department.depth)}
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reports to
              <select className="portal-input" defaultValue="" name="reportsToId">
                <option value="">Not set</option>
                {positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="portal-check">
              <input name="canAssignTasks" type="checkbox" />
              <span>Can assign tasks</span>
            </label>
            <label className="portal-check">
              <input name="canApproveDocuments" type="checkbox" />
              <span>Can approve documents</span>
            </label>
            <label className="portal-check">
              <input name="canIssueResolutions" type="checkbox" />
              <span>Can issue resolutions</span>
            </label>
            <button className="portal-button" type="submit">
              Create position
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
