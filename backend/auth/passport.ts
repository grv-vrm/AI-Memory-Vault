import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { PrismaClient } from "../generated/prisma/client";

const prisma = new PrismaClient();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: process.env.OAUTH_CALLBACK_URL!
}, async (_accessToken: any, _refreshToken: any, _params: any, profile: Profile, done: any) => {
  try {
    const email = profile.emails?.[0]?.value ?? null;
    const name = profile.displayName ?? null;
    const image = profile.photos?.[0]?.value ?? null;
    const provider = "google";
    const providerAccountId = profile.id;

    // 1) Check if provider account already exists
    const existingAccount = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true }
    });
    if (existingAccount) return done(null, existingAccount.user);

    // 2) Try to find user by email to avoid duplicate users
    let user = email ? await prisma.user.findUnique({ where: { email }}) : null;

    if (!user) {
      // create new user
      user = await prisma.user.create({
        data: { email, name, image }
      });
    } else {
      // update user profile optionally
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name, image }
      });
    }

    // 3) create account link
    await prisma.account.create({
      data: {
        provider,
        providerAccountId,
        userId: user.id,
        accessToken: _accessToken,
        refreshToken: _refreshToken
      }
    });

    return done(null, user);
  } catch (err) {
    return done(err as any);
  }
}));

export default passport;
