module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`[Event] Ready: ${client.user.tag} is online.`);
    }
};