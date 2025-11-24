// commons/api.js
import axios from 'axios';

export async function postQuery(url, query) {
    const { data } = await axios.post(url, { query });
    return data;
}

export async function fetchUUIDFromPlayerDB(username) {
    const res = await axios.get(
        `https://playerdb.co/api/player/minecraft/${encodeURIComponent(username)}`
    );
    if (!res.data.success) throw new Error('Minecraft user not found');
    return res.data.data.player.id;
}

export async function fetchUsernameFromPlayerDB(uuid) {
    const res = await axios.get(
        `https://playerdb.co/api/player/minecraft/${encodeURIComponent(uuid)}`
    );
    if (!res.data.success) throw new Error('UUID not found');
    return res.data.data.player.username;
}
