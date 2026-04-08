import { NextResponse } from "next/server";
import { getBackendBaseUrl, getSessionAccessToken } from "@/lib/auth";

export async function POST(request: Request) {
  const accessToken = await getSessionAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const incoming = await request.formData();
  const outgoing = new FormData();

  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }

  outgoing.set("file", file, file.name);

  const params = new URLSearchParams();
  const displayName = String(incoming.get("displayName") ?? "").trim();
  const folderId = String(incoming.get("folderId") ?? "").trim();
  const classification = String(incoming.get("classification") ?? "").trim();
  const uploadNote = String(incoming.get("uploadNote") ?? "").trim();

  if (displayName) params.set("displayName", displayName);
  if (folderId) params.set("folderId", folderId);
  if (classification) params.set("classification", classification);
  if (uploadNote) params.set("uploadNote", uploadNote);

  const response = await fetch(
    `${getBackendBaseUrl()}/files/upload${params.toString() ? `?${params.toString()}` : ""}`,
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
