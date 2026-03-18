export async function parsePdf(buffer: Buffer): Promise<string> {
  // Import the inner lib directly to skip pdf-parse's index.js
  // which tries to read a test file on require()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");
  const data = await pdfParse(buffer);
  return data.text;
}
