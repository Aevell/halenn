import { handleEnquiry } from "../../lib/enquiries";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request) {
  return handleEnquiry(request, {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    ENQUIRY_FROM_EMAIL: process.env.ENQUIRY_FROM_EMAIL,
  });
}
