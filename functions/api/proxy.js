// The Cloudflare Worker acts as a secure proxy to the Gemini API.

export async function onRequestPost(context) {
    try {
        const GEMINI_API_KEY = context.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
        }

        const { action, payload } = await context.request.json();
        
        const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

        let prompt;
        let schema;

        switch (action) {
            case 'generateCase':
                const topics = ["SaaS Platform", "E-commerce Website", "Internal IT Project", "Healthcare Software"];
                const roles = ["Customer Success Manager", "Project Manager"];
                const randomTopic = topics[Math.floor(Math.random() * topics.length)];
                const randomRole = roles[Math.floor(Math.random() * roles.length)];

                prompt = `Generate a new, short and concise case file for a business simulation game that can be solved in 5-6 signal questions. The theme is: ${randomTopic} for a ${randomRole}. The JSON object must have "title", "noise", and "signal" properties. "signal" must contain "rootCause" and "goal".`;
                schema = { type: "OBJECT", properties: { "title": { "type": "STRING" }, "noise": { "type": "STRING" }, "signal": { "type": "OBJECT", "properties": { "rootCause": { "type": "STRING" }, "goal": { "type": "STRING" }}}} };
                break;
            
            case 'getResponse':
                const { question, caseFile } = payload;
                prompt = `You are a role-playing AI and a game judge. First, role-play as a frustrated customer based on the scenario. Second, evaluate the user's question.
                SCENARIO: ${caseFile.noise}
                SECRET INFO: The root cause is "${caseFile.signal.rootCause}". The real goal is "${caseFile.signal.goal}".
                USER'S QUESTION: "${question}"
                Return a JSON object with "response" (string), "score" (number: -5 for noise, 5 for mixed, 10 for signal), and "justification" (string).`;
                schema = { type: "OBJECT", properties: { "response": { "type": "STRING" }, "score": { "type": "NUMBER" }, "justification": { "type": "STRING" }} };
                break;

            case 'scoreDiagnosis':
                 const { signal, submittedRootCause, submittedGoal } = payload;
                 prompt = `You are a game judge. Compare the user's submitted diagnosis with the correct answer.
                 CORRECT ROOT CAUSE: "${signal.rootCause}"
                 CORRECT GOAL: "${signal.goal}"
                 USER'S SUBMITTED ROOT CAUSE: "${submittedRootCause}"
                 USER'S SUBMITTED GOAL: "${submittedGoal}"
                 Return a JSON object with "correctRootCause" (boolean), and "correctGoal" (boolean).`;
                 schema = { type: "OBJECT", properties: { "correctRootCause": { "type": "BOOLEAN" }, "correctGoal": { "type": "BOOLEAN" }} };
                 break;

            default:
                return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
        }

        const apiPayload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        };

        const apiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiPayload)
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error("Gemini API Error:", errorText);
            return new Response(JSON.stringify({ error: 'Gemini API request failed', details: errorText }), { status: 500 });
        }

        const result = await apiResponse.json();
        const text = result.candidates[0].content.parts[0].text;
        
        const finalResponse = JSON.parse(text);
        
        return new Response(JSON.stringify(finalResponse), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("Worker Error:", error);
        return new Response(JSON.stringify({ error: 'An internal error occurred', details: error.message }), { status: 500 });
    }
}
