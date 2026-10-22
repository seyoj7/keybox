import { handleApiRequest } from "../../../backend/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleApiRequest;
export const POST = handleApiRequest;
export const PUT = handleApiRequest;
export const DELETE = handleApiRequest;
