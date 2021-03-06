import { NetworkPeer } from 'shared/model/Peer/networkPeer';
import { PeerAddress } from 'shared/model/types';
import IPeerRepository from 'core/repository/peer/index';
import { logger } from 'shared/util/logger';
import { peerAddressToString } from 'core/util/peer';


class PeerNetworkRepository implements IPeerRepository <PeerAddress, NetworkPeer> {
    private peers: Map<string, NetworkPeer>;
    private banList: Set<string>;

    constructor() {
        this.peers = new Map();
        this.banList = new Set();
    }

    ban(peerAddress: PeerAddress): void {
        logger.debug(`[Repository][Peer][ban] peer ${peerAddressToString(peerAddress)} has been banned`);
        this.banList.add(peerAddressToString(peerAddress));
        if (this.has(peerAddress)) {
            const peer = this.get(peerAddress);
            peer.ban();
        }
    }

    unban(peerAddress: PeerAddress): void {
        logger.debug(`[Repository][Peer][unban] peer ${peerAddressToString(peerAddress)}`);
        this.banList.delete(peerAddressToString(peerAddress));
        if (this.has(peerAddress)) {
            const peer = this.get(peerAddress);
            peer.unban();
        }
    }

    isBanned(peerAddress: PeerAddress): boolean {
        return this.banList.has(peerAddressToString(peerAddress));
    }

    clearBanList(): void {
        this.banList.clear();
    }

    add(peerAddress: PeerAddress, socket: SocketIO.Socket | SocketIOClient.Socket): void {
        this.peers.set(
            peerAddressToString(peerAddress),
            new NetworkPeer({
                peerAddress,
                socket,
                isBanned: this.isBanned(peerAddress)
            })
        );
    }

    remove(peerAddress: PeerAddress): void {
        if (!this.has(peerAddress)) {
            return;
        }
        const peer = this.get(peerAddress);
        peer.disconnect();
        this.peers.delete(peerAddressToString(peerAddress));
    }

    removeAll(): void {
        [...this.peers.keys()].forEach(key => {
            this.peers.get(key).disconnect();
            this.peers.delete(key);
        });
    }

    get(peerAddress: PeerAddress): NetworkPeer {
        return this.peers.get(peerAddressToString(peerAddress));
    }

    getManyByAddress(peerAddresses: Array<PeerAddress>): Array<NetworkPeer> {
        return peerAddresses.filter((peerAddress: PeerAddress) => this.has(peerAddress))
            .map((peerAddress: PeerAddress) => this.get(peerAddress));
    }

    getAll(): Array<NetworkPeer> {
        return [...this.peers.values()];
    }

    has(peerAddress: PeerAddress): boolean {
        return this.peers.has(peerAddressToString(peerAddress));
    }

    get count(): number {
        return this.peers.size;
    }

    get unbanCount(): number {
        return this.getAll()
            .filter((networkPeer: NetworkPeer) => !this.isBanned(networkPeer.peerAddress)).length;
    }
}

export default new PeerNetworkRepository();
