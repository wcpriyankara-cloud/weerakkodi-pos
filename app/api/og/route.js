// Static export compatible API route
export async function GET() {
  return new Response(JSON.stringify({ status: 'ok', mode: 'static-export' }), {
    headers: { 'content-type': 'application/json' }
  });
}
