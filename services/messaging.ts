import { AppSettings } from '../types';

export const MessagingService = {
    formatTestMessage: () => {
        return `This is a test message from Jeevan Atulya CRM sent at ${new Date().toLocaleTimeString()}.`;
    },

    sendMessage: async (settings: AppSettings, phone: string, message: string): Promise<boolean> => {
        if (!settings.messaging?.enabled) {
            console.warn('Messaging is disabled');
            return false;
        }

        const config = settings.messaging;
        if (!config.url) {
            console.error('Messaging URL not configured');
            return false;
        }

        try {
            let response;
            if (config.provider === 'AndroidGateway') {
                // GET request format for Android Gateway
                const url = new URL(config.url);
                url.searchParams.append('phone', phone);
                url.searchParams.append('message', message);
                if (config.apiKey) {
                    url.searchParams.append('key', config.apiKey);
                }

                response = await fetch(url.toString());
            } else if (config.provider === 'SMSGate') {
                // POST request format for generic SMS Gateways
                response = await fetch(config.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(config.username && config.password ? {
                            'Authorization': 'Basic ' + btoa(config.username + ':' + config.password)
                        } : {})
                    },
                    body: JSON.stringify({
                        to: phone,
                        message: message,
                        sender: config.officePhoneNumber
                    })
                });
            } else {
                console.warn('Unknown provider');
                return false;
            }

            if (response.ok) {
                console.log('Message sent successfully');
                return true;
            } else {
                console.error('Failed to send message:', await response.text());
                return false;
            }
        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }
};
