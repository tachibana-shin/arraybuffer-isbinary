const MAX_BYTES = 512

// A very basic non-exception raising reader. Read bytes and
// at the end use hasError() to check whether this worked.
class Reader {
  public fileBuffer: Uint8Array
  public size: number
  public offset: number
  public error: boolean

  constructor(fileBuffer: Uint8Array, size: number) {
    this.fileBuffer = fileBuffer
    this.size = size
    this.offset = 0
    this.error = false
  }

  public hasError(): boolean {
    return this.error
  }

  public nextByte(): number {
    if (this.offset === this.size || this.hasError()) {
      this.error = true
      return 0xff
    }
    return this.fileBuffer[this.offset++]
  }

  public next(len: number): number[] {
    const n = []
    // eslint-disable-next-line functional/no-let
    for (let i = 0; i < len; i++) n[i] = this.nextByte()

    return n
  }
}

// Read a Google Protobuf var(iable)int from the buffer.
function readProtoVarInt(reader: Reader): number {
  // eslint-disable-next-line functional/no-let
  let idx = 0
  // eslint-disable-next-line functional/no-let
  let varInt = 0

  while (!reader.hasError()) {
    const b = reader.nextByte()
    varInt = varInt | ((b & 0x7f) << (7 * idx))
    if ((b & 0x80) === 0) break

    idx++
  }

  return varInt
}

// Attempt to taste a full Google Protobuf message.
function readProtoMessage(reader: Reader): boolean {
  const varInt = readProtoVarInt(reader)
  const wireType = varInt & 0x7

  switch (wireType) {
    case 0:
      readProtoVarInt(reader)
      return true
    case 1:
      reader.next(8)
      return true
    case 2:
      // eslint-disable-next-line no-case-declarations
      const len = readProtoVarInt(reader)
      reader.next(len)
      return true
    case 5:
      reader.next(4)
      return true
  }
  return false
}

// Check whether this seems to be a valid protobuf file.
export function isBinaryProto(
  fileBuffer: Uint8Array,
  totalBytes: number
): boolean {
  const reader = new Reader(fileBuffer, totalBytes)
  // eslint-disable-next-line functional/no-let
  let numMessages = 0

  while (true) {
    // Definitely not a valid protobuf
    if (!readProtoMessage(reader) && !reader.hasError()) return false

    // Short read?
    if (reader.hasError()) break

    numMessages++
  }

  return numMessages > 0
}

export function isBinaryFile(
  file: Uint8Array | ArrayBuffer,
  size?: number
): boolean {
  if (size === undefined) size = file.byteLength

  if (file + "" === "[object ArrayBuffer]") file = new Uint8Array(file)

  return isBinaryCheck(file as Uint8Array, size)
}

export function isBinaryCheck(
  fileBuffer: Uint8Array,
  bytesRead: number
): boolean {
  // empty file. no clue what it is.
  if (bytesRead === 0) return false

  // eslint-disable-next-line functional/no-let
  let suspiciousBytes = 0
  const totalBytes = Math.min(bytesRead, MAX_BYTES)

  // UTF-8 BOM
  if (
    bytesRead >= 3 &&
    fileBuffer[0] === 0xef &&
    fileBuffer[1] === 0xbb &&
    fileBuffer[2] === 0xbf
  )
    return false

  // UTF-32 BOM
  if (
    bytesRead >= 4 &&
    fileBuffer[0] === 0x00 &&
    fileBuffer[1] === 0x00 &&
    fileBuffer[2] === 0xfe &&
    fileBuffer[3] === 0xff
  )
    return false

  // UTF-32 LE BOM
  if (
    bytesRead >= 4 &&
    fileBuffer[0] === 0xff &&
    fileBuffer[1] === 0xfe &&
    fileBuffer[2] === 0x00 &&
    fileBuffer[3] === 0x00
  )
    return false

  // GB BOM
  if (
    bytesRead >= 4 &&
    fileBuffer[0] === 0x84 &&
    fileBuffer[1] === 0x31 &&
    fileBuffer[2] === 0x95 &&
    fileBuffer[3] === 0x33
  )
    return false

  if (totalBytes >= 5 && fileBuffer.slice(0, 5).toString() === "%PDF-") {
    /* PDF. This is binary. */
    return true
  }

  // UTF-16 BE BOM
  if (bytesRead >= 2 && fileBuffer[0] === 0xfe && fileBuffer[1] === 0xff)
    return false

  // UTF-16 LE BOM
  if (bytesRead >= 2 && fileBuffer[0] === 0xff && fileBuffer[1] === 0xfe)
    return false

  // eslint-disable-next-line functional/no-let
  for (let i = 0; i < totalBytes; i++) {
    if (fileBuffer[i] === 0) {
      // NULL byte--it's binary!
      return true
    } else if (
      (fileBuffer[i] < 7 || fileBuffer[i] > 14) &&
      (fileBuffer[i] < 32 || fileBuffer[i] > 127)
    ) {
      // UTF-8 detection
      if (fileBuffer[i] > 193 && fileBuffer[i] < 224 && i + 1 < totalBytes) {
        i++
        if (fileBuffer[i] > 127 && fileBuffer[i] < 192) continue
      } else if (
        fileBuffer[i] > 223 &&
        fileBuffer[i] < 240 &&
        i + 2 < totalBytes
      ) {
        i++
        if (
          fileBuffer[i] > 127 &&
          fileBuffer[i] < 192 &&
          fileBuffer[i + 1] > 127 &&
          fileBuffer[i + 1] < 192
        ) {
          i++
          continue
        }
      }

      suspiciousBytes++
      // Read at least 32 fileBuffer before making a decision
      if (i >= 32 && (suspiciousBytes * 100) / totalBytes > 10) return true
    }
  }

  if ((suspiciousBytes * 100) / totalBytes > 10) return true

  if (suspiciousBytes > 1 && isBinaryProto(fileBuffer, totalBytes)) return true

  return false
}
