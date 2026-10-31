import { z } from "zod";

const adminFields = {
  ADMIN_NAME: z.string().trim().min(2).max(160),
  ADMIN_EMAIL: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  ADMIN_PHONE: z.string().trim().regex(/^\+?[0-9]{7,15}$/),
  ADMIN_PASSWORD: z.string().min(12).max(128)
};

const fieldPrompts = {
  ADMIN_NAME: "Admin name: ",
  ADMIN_EMAIL: "Admin email: ",
  ADMIN_PHONE: "Admin phone number: ",
  ADMIN_PASSWORD: "Admin password (hidden, 12-128 characters): "
};

function parseAdminField(field, value) {
  const parsed = adminFields[field].safeParse(value);
  if (!parsed.success) {
    const messages = [...new Set(parsed.error.issues.map((issue) => issue.message))];
    throw new Error(messages.join(" "));
  }
  return parsed.data;
}

export async function promptAdminCredentials({
  env = process.env,
  promptText,
  promptPassword,
  write = () => {},
  canPrompt = true
}) {
  if (typeof promptText !== "function" || typeof promptPassword !== "function") {
    throw new TypeError("Admin setup requires text and hidden-password prompt functions.");
  }

  const credentials = {};
  for (const field of Object.keys(adminFields)) {
    let value = env[field];
    while (true) {
      if (!value) {
        if (!canPrompt) {
          throw new Error(`${field} is missing or invalid. Correct it in .env or run this command in an interactive terminal.`);
        }
        value = field === "ADMIN_PASSWORD"
          ? await promptPassword(fieldPrompts[field])
          : await promptText(fieldPrompts[field]);
      }

      try {
        credentials[field] = parseAdminField(field, value);
        break;
      } catch (error) {
        write(`${field} is invalid: ${error.message}\n`);
        value = undefined;
      }
    }
  }
  return credentials;
}

export function readHiddenPassword(input, output) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new Error("A terminal is required to enter a password securely. Set ADMIN_PASSWORD in the environment for non-interactive setup."));
  }

  return new Promise((resolve, reject) => {
    let password = "";
    const finish = (error) => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      output.write("\n");
      if (error) reject(error);
      else resolve(password);
    };
    const onData = (chunk) => {
      const value = String(chunk);
      if (value === "\u0003") {
        finish(new Error("Admin setup was cancelled."));
        return;
      }
      if (value === "\r" || value === "\n") {
        finish();
        return;
      }
      if (value === "\u007f" || value === "\b") {
        if (password.length) {
          password = [...password].slice(0, -1).join("");
          output.write("\b \b");
        }
        return;
      }
      if (!/[\u0000-\u001f\u007f]/.test(value)) {
        password += value;
        output.write("*".repeat([...value].length));
      }
    };

    output.write("Admin password (hidden, 12-128 characters): ");
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.on("data", onData);
    input.resume();
  });
}

export async function createAdminAccount({ credentials, transaction, bcrypt }) {
  const validated = Object.fromEntries(
    Object.keys(adminFields).map((field) => [field, parseAdminField(field, credentials[field])])
  );

  try {
    return await transaction(async (client) => {
      const existing = await client.query(
        "SELECT id,role,email,phone FROM users WHERE lower(email)=lower($1) OR phone=$2 LIMIT 1",
        [validated.ADMIN_EMAIL, validated.ADMIN_PHONE]
      );
      if (existing.rows.length) {
        const emailConflict = existing.rows.some((row) =>
          String(row.email || "").toLowerCase() === validated.ADMIN_EMAIL
        );
        const phoneConflict = existing.rows.some((row) => row.phone === validated.ADMIN_PHONE);
        const conflict = emailConflict && phoneConflict
          ? "Email and phone number are already registered."
          : emailConflict
            ? "Email is already registered."
            : phoneConflict
              ? "Phone number is already registered."
              : "Email or phone number is already registered.";
        throw new Error(`${conflict} No account was changed.`);
      }

      const passwordHash = await bcrypt.hash(validated.ADMIN_PASSWORD, 12);
      const result = await client.query(
        `INSERT INTO users (role,name,email,phone,password_hash)
         VALUES ('ADMIN',$1,$2,$3,$4)
         RETURNING id`,
        [validated.ADMIN_NAME, validated.ADMIN_EMAIL, validated.ADMIN_PHONE, passwordHash]
      );
      return result.rows[0];
    });
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("Email or phone number is already registered. No account was changed.");
    }
    throw error;
  }
}
