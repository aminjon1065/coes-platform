import { NextResponse } from "next/server";
import { getBackendBaseUrl, getSessionAccessToken } from "@/lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const accessToken = await getSessionAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const { id } = await context.params;
  const incoming = await request.formData();
  const outgoing = new FormData();

  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }

  outgoing.set("file", file, file.name);

  const params = new URLSearchParams();
  const uploadNote = String(incoming.get("uploadNote") ?? "").trim();
  if (uploadNote) {
    params.set("uploadNote", uploadNote);
  }

  const response = await fetch(
    `${getBackendBaseUrl()}/files/${id}/versions${params.toString() ? `?${params.toString()}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: outgoing,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: await response.text() },
      { status: response.status },
    );
  }

  const result = await response.json();
  return NextResponse.json(result, { status: 201 });
}
