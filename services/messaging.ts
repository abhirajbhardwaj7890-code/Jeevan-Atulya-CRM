import { Member, Account, Transaction, AppSettings } from '../types';

export const MessagingService = {
    /**
     * Sends a generic message via the Android Gateway API.
     */
    async sendMessage(settings: AppSettings, phoneNumber: string, message: string): Promise<boolean> {
        if (!settings.messaging?.enabled || settings.messaging.provider === 'None') {
            console.log('Messaging is disabled.');
            return false;
        }

        if (!settings.messaging.url || !settings.messaging.apiKey) {
            console.error('Messaging settings missing URL or API Key.');
            return false;
        }

        // Clean phone number (remove non-digits, ensure 10 digits for India)
        const cleanPhone = phoneNumber.replace(/\D/g, '').slice(-10);
        if (cleanPhone.length !== 10) {
            console.error('Invalid phone number:', phoneNumber);
            return false;
        }

        // Android Gateway API typical format (e.g., Simple SMS Gateway)
        // URL: http://192.168.1.5:8080/send
        // Query Params: phone, message, key
        try {
            const response = await fetch(`${settings.messaging.url}?phone=${cleanPhone}&message=${encodeURIComponent(message)}&key=${settings.messaging.apiKey}`, {
                method: 'GET', // Most Android Gateways use simple GET/POST
            });

            if (response.ok) {
                console.log(`Message sent successfully to ${cleanPhone}`);
                return true;
            } else {
                console.error('Failed to send message:', response.statusText);
                return false;
            }
        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    },

    /**
     * Templates for different events
     */
    formatAccountOpening(member: Member, account: Account): string {
        return `Welcome to Jeevan Atulya Society, ${member.fullName}! Your ${account.type} a/c ${account.accountNumber} has been opened successfully. Balance: Rs. ${account.balance}. Thank you.`;
    },

    formatTransaction(member: Member, account: Account, transaction: Transaction): string {
        const type = transaction.type === 'credit' ? 'deposited in' : 'withdrawn from';
        return `Dear ${member.fullName}, Rs. ${transaction.amount} has been ${type} your a/c ${account.accountNumber} on ${transaction.date}. Current Balance: Rs. ${account.balance}. - Jeevan Atulya`;
    },

    formatAccountClosing(member: Member, account: Account): string {
        return `Dear ${member.fullName}, your ${account.type} a/c ${account.accountNumber} has been closed. Final settlement completed. - Jeevan Atulya`;
    },

    formatTestMessage(): string {
        return `Test message from Jeevan Atulya CRM. Messaging system is working correctly.`;
    }
};
