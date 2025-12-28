import { AppSettings } from '../types';

export const MessagingService = {
    formatTestMessage: () => {
        return `This is a test message from Jeevan Atulya CRM sent at ${new Date().toLocaleTimeString()}.`;
    },

    replacePlaceholders: (template: string, data: any) => {
        let result = template;
        Object.keys(data).forEach(key => {
            const regex = new RegExp(`{${key}}`, 'g');
            result = result.replace(regex, data[key]);
        });
        return result;
    },

    sendMessage: async (settings: AppSettings, phone: string, message: string, force: boolean = false): Promise<boolean> => {
        if (!settings.messaging?.enabled && !force) {
            console.warn('Messaging is disabled');
            return false;
        }

        const config = settings.messaging;
        if (!config?.apiKey || !config?.deviceId) {
            console.error('Messaging configuration missing (API Key or Device ID)');
            return false;
        }

        // Strip non-numeric characters from phone
        const cleanPhone = phone.replace(/\D/g, '').slice(-10);
        const finalPhone = phone.startsWith('+') ? phone : `+91${cleanPhone}`;

        try {
            const url = `https://api.textbee.dev/api/v1/gateway/devices/${config.deviceId}/send-sms`;
            const payload = {
                recipients: [finalPhone],
                message: message
            };

            console.log('Sending to TextBee Cloud:', url);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.apiKey
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                console.log('Message sent successfully via TextBee Cloud');
                return true;
            } else {
                const errorText = await response.text();
                console.error('Failed to send message via TextBee Cloud:', errorText);
                return false;
            }
        } catch (error) {
            console.error('Error sending message via TextBee Cloud:', error);
            return false;
        }
    }
};
