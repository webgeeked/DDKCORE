import { MemoryPeer } from 'shared/model/Peer/memoryPeer';
import { PeerAddress } from 'shared/model/types';

type MemoryHeight = {
    MAX_HEIGHT: number;
    MIN_HEIGHT: number;
};

// TODO don't touch
export const blockHeightMemoryConsensus = (memoryPeers: Array<MemoryPeer>): MemoryHeight => {

    const heightBlockPeers: Map<number, Set<PeerAddress>> = new Map();

    memoryPeers.forEach((memoryPeer: MemoryPeer) => {
        [...memoryPeer.headers.blocksIds.keys()].forEach((height: number) => {
            if (!heightBlockPeers.has(height)) {
                heightBlockPeers.set(height, new Set([memoryPeer.peerAddress]));
            } else {
                heightBlockPeers.get(height).add(memoryPeer.peerAddress);
            }
        });
    });

    const PeersMatchesCount: Array<number> = [...heightBlockPeers.values()]
        .map((peers: Set<PeerAddress>): number => {
            return peers.size;
        });

    const MaxPeersMatches: number = Math.max(...PeersMatchesCount);


    const MaxMatchesHeight: Array<number> = [];

    [...heightBlockPeers.entries()].forEach(([height, peers]) => {
        if (peers.size === MaxPeersMatches) {
            MaxMatchesHeight.push(height);
        }
    });

    return {
        MAX_HEIGHT: Math.max(...MaxMatchesHeight),
        MIN_HEIGHT: Math.min(...MaxMatchesHeight)
    };
};

export const peerAddressToString = (peerAddress: PeerAddress): string => {
    return `${peerAddress.ip}:${peerAddress.port}`;
};

export const diffArrayPeers = (arrayA: Array<PeerAddress>, arrayB: Array<PeerAddress>): Array<PeerAddress> => {
    const setIp = new Set(arrayB.map(peer => peer.ip));
    return arrayA.filter(str => !setIp.has(str.ip));
};
