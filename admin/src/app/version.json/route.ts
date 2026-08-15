export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export function GET() {
  return Response.json(
    {
      buildId: BUILD_ID,
      version: process.env.npm_package_version ?? "0.1.0",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}
