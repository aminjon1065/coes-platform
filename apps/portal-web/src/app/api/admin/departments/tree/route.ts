import { NextResponse } from "next/server";
import { getDepartmentTree } from "@/lib/admin";

export async function GET() {
  const tree = await getDepartmentTree();
  return NextResponse.json(tree);
}
