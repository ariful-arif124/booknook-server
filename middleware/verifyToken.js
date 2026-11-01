
const authBaseURL = process.env.AUTH_BASE_URL;

if (!authBaseURL) {
  throw new Error("AUTH_BASE_URL is not defined");
}

const verifierPromise = import("jose").then(
  ({ jwtVerify, createRemoteJWKSet }) => ({
    jwtVerify,
    jwks: createRemoteJWKSet(
      new URL("/api/auth/jwks", authBaseURL)
    ),
  })
);

async function verifyToken(req, res, next) {
  const authorization = req.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const { jwtVerify, jwks } = await verifierPromise;

    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: authBaseURL,
      audience: authBaseURL,
      algorithms: ["EdDSA"],
    });

    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.email !== "string" ||
      !payload.email ||
      typeof payload.name !== "string" ||
      !payload.name
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    req.user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
}

module.exports = verifyToken;
