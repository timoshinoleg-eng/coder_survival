export async function recordMemeShare(client, userId, templateId, format, sharedTo) {
  await client.query(
    `INSERT INTO meme_shares (user_id, template_id, format, shared_to)
     VALUES ($1, $2, $3, $4)`,
    [userId, templateId, format, sharedTo || null]
  );
}
