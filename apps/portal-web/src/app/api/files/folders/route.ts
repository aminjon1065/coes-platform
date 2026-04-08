import { NextRequest, NextResponse } from "next/server";
import { createFolder, getFolderContents } from "@/lib/files";

export async function GET(request: NextRequest) {
  const folderId = request.nextUrl.searchParams.get("folderId") ?? undefined;
  const contents = await getFolderContents(folderId);
  return NextResponse.json(contents);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    name: string;
    parentId?: string;
    classification: number;
    description?: string;
  };
  const folder = await createFolder(body);
  return NextResponse.json(folder, { status: 201 });
}
