"use server";

import { revalidatePath } from "next/cache";
import { triggerSearchReindex } from "@/lib/admin";

export async function triggerSearchReindexAction(formData: FormData) {
  const indices = formData
    .getAll("indices")
    .map((value) => String(value).trim())
    .filter(Boolean);

  await triggerSearchReindex({
    indices,
    batchSize: Number(formData.get("batchSize") ?? 250),
    ensureIndices: formData.get("ensureIndices") === "on",
    refresh: formData.get("refresh") === "on",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/system");
}
