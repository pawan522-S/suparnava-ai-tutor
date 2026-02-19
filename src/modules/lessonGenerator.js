const OpenAI = require('openai');

const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
const client = new OpenAI({
    apiKey: provider === 'groq' ? (process.env.GROQ_API_KEY || '') : (process.env.OPENAI_API_KEY || ''),
    baseURL: provider === 'groq' ? 'https://api.groq.com/openai/v1' : undefined,
});
const MODEL = provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

// Pre-defined scenario categories for offline fallback lessons
const OFFLINE_LESSONS = {
    beginner: [
        {
            id: 'greet_1', title: 'Greetings & Introductions', icon: '👋', duration: 10, xp: 50,
            objective: 'Learn to greet people and introduce yourself confidently.',
            exercises: [
                { prompt: 'Say: "Hello, my name is ___. Nice to meet you."', type: 'repeat' },
                { prompt: 'Ask your tutor how they are doing.', type: 'free_speak' },
                { prompt: 'Tell me where you are from.', type: 'free_speak' },
            ]
        },
        {
            id: 'daily_1', title: 'Daily Routine', icon: '🌅', duration: 12, xp: 60,
            objective: 'Describe your daily activities in simple present tense.',
            exercises: [
                { prompt: 'What time do you wake up?', type: 'free_speak' },
                { prompt: 'Describe your morning routine in 3 sentences.', type: 'free_speak' },
                { prompt: 'Say: "I usually ___ after lunch."', type: 'fill_in' },
            ]
        },
        {
            id: 'numbers_1', title: 'Numbers & Time', icon: '🕐', duration: 8, xp: 40,
            objective: 'Say numbers and tell the time correctly.',
            exercises: [
                { prompt: 'What time is it right now?', type: 'free_speak' },
                { prompt: 'Count from 1 to 20 as quickly as you can.', type: 'repeat' },
            ]
        },
        {
            id: 'food_1', title: 'Food & Ordering', icon: '🍽️', duration: 12, xp: 55,
            objective: 'Order food and talk about your preferences.',
            exercises: [
                { prompt: 'What is your favourite food?', type: 'free_speak' },
                { prompt: 'Say: "I would like ___ and ___, please."', type: 'fill_in' },
            ]
        },
    ],
    intermediate: [
        {
            id: 'work_1', title: 'Work & Career', icon: '💼', duration: 15, xp: 80,
            objective: 'Discuss your job and career goals professionally.',
            exercises: [
                { prompt: 'Describe your job or what you study.', type: 'free_speak' },
                { prompt: 'What are your career goals for the next 5 years?', type: 'free_speak' },
            ]
        },
        {
            id: 'travel_1', title: 'Travel & Directions', icon: '✈️', duration: 15, xp: 75,
            objective: 'Ask for and give directions. Talk about travel experiences.',
            exercises: [
                { prompt: 'Describe a place you have visited.', type: 'free_speak' },
                { prompt: 'How would you ask for directions to the nearest hospital?', type: 'free_speak' },
            ]
        },
        {
            id: 'opinion_1', title: 'Expressing Opinions', icon: '💬', duration: 13, xp: 70,
            objective: 'Use agreeing/disagreeing phrases and express your views.',
            exercises: [
                { prompt: 'Do you think social media is good or bad? Explain.', type: 'free_speak' },
                { prompt: 'Practice: "In my opinion...", "I believe...", "I think..."', type: 'repeat' },
            ]
        },
        {
            id: 'interview_1', title: 'Job Interview Practice', icon: '🎯', duration: 20, xp: 100,
            objective: 'Answer common interview questions confidently.',
            exercises: [
                { prompt: 'Tell me about yourself.', type: 'free_speak' },
                { prompt: 'What are your strengths and weaknesses?', type: 'free_speak' },
                { prompt: 'Why do you want this job?', type: 'free_speak' },
            ]
        },
    ],
    advanced: [
        {
            id: 'debate_1', title: 'Debate & Persuasion', icon: '⚖️', duration: 20, xp: 120,
            objective: 'Construct and defend arguments using advanced vocabulary.',
            exercises: [
                { prompt: 'Argue for or against: "Technology makes us less social."', type: 'free_speak' },
                { prompt: 'Use at least 3 transition phrases: "Furthermore...", "On the contrary...", "It stands to reason that..."', type: 'free_speak' },
            ]
        },
        {
            id: 'idioms_1', title: 'Idioms & Phrasal Verbs', icon: '🎨', duration: 15, xp: 90,
            objective: 'Use common English idioms and phrasal verbs naturally.',
            exercises: [
                { prompt: 'Use "hit the nail on the head" in a sentence.', type: 'free_speak' },
                { prompt: 'Explain what "break the ice" means and use it in context.', type: 'free_speak' },
            ]
        },
        {
            id: 'business_1', title: 'Business English', icon: '📊', duration: 18, xp: 100,
            objective: 'Communicate professionally in a business context.',
            exercises: [
                { prompt: 'Deliver a 30-second elevator pitch for a product you love.', type: 'free_speak' },
                { prompt: 'Negotiate: You want a 20% discount on a bulk order.', type: 'role_play' },
            ]
        },
    ],
};

/**
 * Get the offline lesson library for a given level.
 * Always available even without API access.
 */
function getOfflineLessons(level = 'beginner') {
    return OFFLINE_LESSONS[level] || OFFLINE_LESSONS.beginner;
}

/**
 * Generate a personalized 7-day lesson plan using LLM.
 * Falls back to offline lessons if LLM is unavailable.
 *
 * @param {object} userProfile - User profile object
 * @returns {Promise<Array<object>>} - Array of lesson objects
 */
async function generateLessonPlan(userProfile) {
    const { level = 'beginner', commonErrors = [], topicsPracticed = [] } = userProfile;

    // Always include offline lessons as guaranteed fallback
    const baseLessons = getOfflineLessons(level);

    try {
        const prompt = `You are designing a personalized English learning curriculum.

Student profile:
- Level: ${level}
- Common mistakes: ${commonErrors.join(', ') || 'none yet'}
- Topics already practiced: ${topicsPracticed.join(', ') || 'none yet'}

Generate a JSON array of exactly 3 NEW lesson objects (not duplicating topics already practiced).
Each lesson object must follow this exact structure:
{
  "id": "<unique_snake_case_id>",
  "title": "<short lesson title>",
  "icon": "<single emoji>",
  "duration": <minutes as integer>,
  "xp": <XP reward as integer, 40-150>,
  "objective": "<what the student will learn, 1 sentence>",
  "focusArea": "<one of: grammar|vocabulary|pronunciation|fluency|listening>",
  "exercises": [
    { "prompt": "<speaking exercise instruction>", "type": "<repeat|free_speak|fill_in|role_play>" }
  ]
}

Focus on fixing: ${commonErrors.join(', ') || 'general fluency'}.
Return ONLY the JSON array. No markdown, no explanation.`;

        const response = await client.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: 'Return only valid JSON arrays. No markdown. No text outside the JSON.' },
                { role: 'user', content: prompt },
            ],
            max_tokens: 800,
            temperature: 0.7,
        });

        const raw = response.choices[0].message.content.trim();
        const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        const aiLessons = JSON.parse(jsonStr);

        if (Array.isArray(aiLessons) && aiLessons.length > 0) {
            // Merge AI lessons with offline lessons, AI lessons first (personalized)
            return [...aiLessons, ...baseLessons].slice(0, 7);
        }
    } catch (err) {
        console.warn('[LessonGenerator] AI lesson generation failed, using offline lessons:', err.message);
    }

    return baseLessons;
}

/**
 * Get all available scenario practice modes.
 */
function getScenarios() {
    return [
        { id: 'daily_talk', label: 'Daily Talk', icon: '💬', description: 'Casual conversations about everyday topics', level: 'beginner' },
        { id: 'interview', label: 'Job Interview', icon: '🎯', description: 'Practice answering professional interview questions', level: 'intermediate' },
        { id: 'travel', label: 'Travel & Tourism', icon: '✈️', description: 'Navigate airports, hotels, and tourist spots', level: 'beginner' },
        { id: 'shopping', label: 'Shopping', icon: '🛍️', description: 'Bargain, ask about products, and handle transactions', level: 'beginner' },
        { id: 'medical', label: 'Medical / Health', icon: '🏥', description: 'Describe symptoms and communicate with healthcare professionals', level: 'intermediate' },
        { id: 'business', label: 'Business English', icon: '📊', description: 'Meetings, presentations, and professional email speak', level: 'advanced' },
        { id: 'debate', label: 'Debate Club', icon: '⚖️', description: 'Argue and defend positions on current topics', level: 'advanced' },
        { id: 'storytelling', label: 'Storytelling', icon: '📖', description: 'Tell engaging stories using past tenses and descriptive language', level: 'intermediate' },
    ];
}

module.exports = { generateLessonPlan, getOfflineLessons, getScenarios };
