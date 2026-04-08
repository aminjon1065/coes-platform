import { NextRequest, NextResponse } from "next/server";
import { createDepartment, flattenDepartments, getDepartmentTree } from "@/lib/admin";

export async function GET() {
  const tree = await getDepartmentTree();
  return NextResponse.json({
    tree,
    items: flattenDepartments(tree),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    name: string;
    code: string;
    parentDepartmentId?: string;
  };
  const created = await createDepartment(body);
  return NextResponse.json(created, { status: 201 });
}
