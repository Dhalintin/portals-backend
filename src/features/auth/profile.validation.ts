import { z } from "zod";
import { passwordSchema } from "./auth.validation";

export function validProfileImage(value: string) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const image = Buffer.from(match[2], "base64");
  if (image.length > 100_000 || image.toString("base64") !== match[2]) return false;
  const dimensions = (width: number, height: number) => width > 0 && height > 0 && width <= 1024 && height <= 1024;
  if (match[1] === "png") {
    return image.length >= 24 && image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
      image.toString("ascii", 12, 16) === "IHDR" && dimensions(image.readUInt32BE(16), image.readUInt32BE(20));
  }
  if (image.length < 12 || image.readUInt16BE(0) !== 0xffd8 || image.readUInt16BE(image.length - 2) !== 0xffd9) return false;
  let offset = 2;
  while (offset + 4 <= image.length) {
    if (image[offset++] !== 0xff) return false;
    while (image[offset] === 0xff) offset++;
    const marker = image[offset++];
    if (offset + 2 > image.length || marker === 0xda || marker === 0xd9) return false;
    const length = image.readUInt16BE(offset);
    if (length < 2 || offset + length > image.length) return false;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      return length >= 7 && dimensions(image.readUInt16BE(offset + 5), image.readUInt16BE(offset + 3));
    }
    offset += length;
  }
  return false;
}

export const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.string().max(140_000).refine(validProfileImage, "Choose a PNG or JPEG profile picture up to 100 KB and 1024 pixels.").nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Choose something to update.");

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
}).strict();
