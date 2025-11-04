// Scrape From : Nekolabs

const axios = require('axios');
const crypto = require('crypto');

class Qwen {
    constructor({ email, password }) {
        if (!email) throw new Error('Email is required.');
        if (!password) throw new Error('Password is required.');
        
        this.api = axios.create({
            baseURL: 'https://chat.qwen.ai/api',
            headers: {
                'Bx-V': '2.5.31',
                'Connection': 'keep-alive',
                'Host': 'chat.qwen.ai',
                'Origin': 'https://chat.qwen.ai',
                'Referer': 'https://chat.qwen.ai/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
                'Version': '0.0.230',
                'X-Request-Id': crypto.randomUUID()
            }
        });
        this.types = {
            chat: 't2t',
            search: 'search',
            thinking: 'think'
        };
        this.token = '';
        this.expiresAt = 0;
        this.email = email;
        this.password = password;
        this.isInitialized = false;
    }
    
    isTokenExpired() {
        return !this.token || Date.now() / 1000 >= this.expiresAt - 300;
    }
    
    async refreshToken() {
        try {
            const { data } = await this.api.get('/v1/auths', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (data.token && data.expires_at) {
                this.token = data.token;
                this.expiresAt = data.expires_at;
                return data;
            }
        } catch (error) {
            await this.login();
        }
    }
    
    async ensureValidToken() {
        if (!this.isInitialized) {
            await this.login();
            this.isInitialized = true;
        } else if (this.isTokenExpired()) {
            await this.refreshToken();
        }
    }
    
    login = async function () {
        try {
            const { data } = await this.api.post('/v1/auths/signin', {
                email: this.email,
                password: crypto.createHash('sha256').update(this.password).digest('hex')
            });
            
            this.token = data.token;
            this.expiresAt = data.expires_at;
            
            return data;
        } catch (error) {
            throw new Error(`Failed to login: ${error.message}.`);
        }
    }
    
    models = async function () {
        try {
            await this.ensureValidToken();
            
            const { data } = await this.api.get('/models', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            return data.data.map(model => {
                const abilities = model.info.meta.abilities || {};
                const chatTypes = model.info.meta.chat_type || [];
                
                return {
                    id: model.id,
                    thinking: abilities.thinking === 1 || abilities.thinking === 4 || false,
                    search: chatTypes.includes('search'),
                    vision: abilities.vision === 1 || false
                };
            });
        } catch (error) {
            throw new Error(`Failed to get models: ${error.message}.`);
        }
    }
    
    setInstruction = async function (prompt) {
        try {
            await this.ensureValidToken();
            if (!prompt) throw new Error('Prompt is required.');
            
            const { data } = await this.api.post('/v2/users/user/settings/update', {
                personalization: {
                    name: '',
                    description: '',
                    style: '',
                    instruction: prompt,
                    enable_for_new_chat: true
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            return data.data;
        } catch (error) {
            throw new Error(`Failed to set instruction: ${error.message}.`);
        }
    }
    
    newChat = async function ({ model = 'qwen3-max' } = {}) {
        try {
            await this.ensureValidToken();
            
            const models = await this.models();
            if (!models.map(m => m.id).includes(model)) throw new Error('Model not found.');
            
            const { data } = await this.api.post('/v2/chats/new', {
                title: 'New Chat',
                models: [model],
                chat_mode: 'normal',
                chat_type: 't2t',
                timestamp: Date.now()
            }, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            return data.data.id;
        } catch (error) {
            throw new Error(`Failed to create new chat: ${error.message}.`);
        }
    }
    
    loadChat = async function (chatId) {
        try {
            await this.ensureValidToken();
            
            if (!chatId) throw new Error('Chat id is required.');
            
            const { data } = await this.api.get(`/v2/chats/${chatId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            return data.data;
        } catch (error) {
            throw new Error(`Failed to load chat: ${error.message}.`);
        }
    }
    
    deleteChat = async function (chatId) {
        try {
            await this.ensureValidToken();
            
            if (!chatId) throw new Error('Chat id is required.');
            
            const { data } = await this.api.delete(`/v2/chats/${chatId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            return data.data;
        } catch (error) {
            throw new Error(`Failed to delete chat: ${error.message}.`);
        }
    }
    
    chat = async function (question, { instruction = null, model = 'qwen3-max', type = 'chat', chatId = null } = {}) {
        try {
            await this.ensureValidToken();
            
            if (!question) throw new Error('Question is required.');
            
            const models = await this.models();
            if (!models.map(m => m.id).includes(model)) throw new Error('Model not found.');
            if (type === 'search' && !models.find(m => model === m.id).search) throw new Error('Search is not supported by the model.');
            if (type === 'thinking' && !models.find(m => model === m.id).thinking) throw new Error('Thinking is not supported by the model.');
            if (!this.types[type]) throw new Error('Type not found.');
            
            let parent = null;
            if (chatId) {
                const chatInfo = await this.loadChat(chatId);
                parent = chatInfo.currentId;
            } else {
                chatId = await this.newChat({ model });
            }
            
            if (instruction) await this.setInstruction(instruction);
            
            const { data } = await this.api.post('/v2/chat/completions', {
                stream: true,
                incremental_output: true,
                chat_id: chatId,
                chat_mode: 'normal',
                model: model,
                parent_id: parent,
                messages: [
                    {
                        fid: crypto.randomUUID(),
                        parentId: parent,
                        childrenIds: [crypto.randomUUID()],
                        role: 'user',
                        content: question,
                        user_action: 'chat',
                        files: [],
                        timestamp: Date.now(),
                        models: [model],
                        chat_type: this.types[type],
                        feature_config: {
                            thinking_enabled: type === 'thinking',
                            output_schema: 'phase'
                        },
                        extra: {
                            meta: {
                                subChatType: this.types[type]
                            }
                        },
                        sub_chat_type: this.types[type],
                        parent_id: parent
                    }
                ],
                timestamp: Date.now()
            }, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                params: {
                    chat_id: chatId
                }
            });
            
            const lines = data.split('\n\n').filter(l => l.trim()).map(l => JSON.parse(l.substring(6)));
            const res = {
                chatId: null,
                response: {
                    reasoning: '',
                    content: '',
                    web_search: []
                },
                timestamp: new Date().toISOString()
            };
            
            lines.forEach(l => {
                if (l?.['response.created']?.chat_id) res.chatId = l['response.created'].chat_id;
                const d = l?.choices?.[0]?.delta;
                if (d?.phase === 'think' && d.content) res.response.reasoning += d.content;
                if (d?.phase === 'answer' && d.content) res.response.content += d.content;
                if (d?.phase === 'web_search' && d.extra?.web_search_info) res.response.web_search = d.extra.web_search_info;
            });
            
            return res;
        } catch (error) {
            throw new Error(`Failed to chat: ${error.message}.`);
        }
    }
};

(async () => {
    // Login
    const q = new Qwen({
        email: 'xxx@gmail.com',
        password: 'xxx'
    });
    
    // Get Models
    const models = await q.models();
    console.log('List Models: ', models);
    
    // Chat
    const chat = await q.chat('hai!', { instruction: 'kamu adalah shiroko, perempuan imut.' });
    console.log('Response 1: ', chat);
    
    // Continue
    const chat2 = await q.chat('apa kabar?', { chatId: chat.chatId });
    console.log('Response 2: ', chat2);
    
    // Delete Chat
    const del = await q.deleteChat(chat.chatId);
    console.log('Delete Response: ', del);
})();
