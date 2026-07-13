Deno.serve(async () => {
  return new Response(
    JSON.stringify({
      success: true,
      message: "Allo Webhook OK 🚀",
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
});