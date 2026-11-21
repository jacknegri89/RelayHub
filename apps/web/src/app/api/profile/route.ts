import { z } from "zod";
import { database } from "@relayhub/db";
import { isJson, parseJson, readBody } from "@relayhub/shared/protocol";
import { avatarIds, avatarPath } from "../../../profile-avatars";
import { requireSession } from "../../../server/authorization";
import { validProfileEditToken } from "../../../server/form-proof";
import {
  assertOrigin,
  handle,
  HttpError,
  response,
} from "../../../server/http";
import { throttle } from "../../../server/rate";

const profileInput = z.strictObject({
  name: z.string().trim().min(1).max(80),
  avatar: z.enum(avatarIds).optional(),
  csrfToken: z.string().optional(),
});

export function POST(request: Request) {
  return handle(async (requestId) => {
    assertOrigin(request);
    if (!isJson(request.headers.get("content-type"))) {
      throw new HttpError(415, "unsupported_content_type");
    }
    const session = await requireSession(request.headers);
    await throttle("profile-edit:" + session.user.id, 12);
    const bytes = await readBody(request, 2048);
    let body: unknown;
    try {
      body = parseJson(bytes);
    } catch {
      throw new HttpError(422, "invalid_json");
    }
    const input = profileInput.safeParse(body);
    if (!input.success) {
      throw new HttpError(422, "invalid_profile");
    }
    if (!validProfileEditToken(session.session.id, input.data.csrfToken)) {
      throw new HttpError(403, "profile_form_expired");
    }
    const data: { name: string; image?: string | null } = {
      name: input.data.name,
    };
    if (input.data.avatar) {
      data.image = avatarPath(input.data.avatar);
    }
    await database().user.update({
      where: { id: session.user.id },
      data,
      select: { id: true },
    });
    return response(200, { status: true }, requestId);
  });
}
