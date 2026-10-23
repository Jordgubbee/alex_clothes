// Hämtar alla filer ur en drag-och-släpp, även när man släpper hela mappar (rekursivt).
export async function filesFromDrop(dataTransfer) {
  const entries = [...dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean)
  if (!entries.length) return [...dataTransfer.files]
  const out = []
  const walk = async (entry) => {
    if (entry.isFile) out.push(await new Promise((res, rej) => entry.file(res, rej)))
    else if (entry.isDirectory) for (const child of await readAll(entry.createReader())) await walk(child)
  }
  for (const e of entries) await walk(e)
  return out
}

// readEntries returnerar max 100 åt gången, så läs tills det tar slut.
async function readAll(reader) {
  const all = []
  for (;;) {
    const batch = await new Promise((res, rej) => reader.readEntries(res, rej))
    if (!batch.length) return all
    all.push(...batch)
  }
}
