// Node entry for the model: same indexes the browser builds, from a parsed packet.
import type { Packet } from '../src/data/types';
import { __indexPacket, type Model } from '../src/data/model';
export function loadModelFromPacket(p: Packet): Model { return __indexPacket(p); }
