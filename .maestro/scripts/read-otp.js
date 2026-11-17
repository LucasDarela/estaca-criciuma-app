// Reads the 6-digit sign-in code of the most recent e-mail in the local Mailpit
// (supabase start serves it on port 54324) and exposes it as output.code.
var response = http.get('http://localhost:54324/api/v1/messages');
var messages = json(response.body).messages;
var match = /\b(\d{6})\b/.exec(messages[0].Snippet);
output.code = match ? match[1] : '';
