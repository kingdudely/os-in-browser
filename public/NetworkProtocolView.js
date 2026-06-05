export default class NetworkProtocolView extends DataView {
	#encodeZigZag(value) {
		return Math.abs(value) * 2 - (value < 0)
	};

	setUnsignedVarInt(offset, value) { 
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new RangeError(`Invalid/unsafe unsigned integer: ${value}`);
		}

		do {
			super.setUint8(offset++, (value & 0x7F) | (value > 0x7F ? 0x80 : 0));
		} while ((value = Math.floor(value / 128)) > 0);  
	
		return offset;
	};

	setSignedVarInt(offset, value) {
		if (!Number.isSafeInteger(value)) {
			throw new RangeError(`Unsafe signed integer: ${value}`);
		};

		offset = this.setUnsignedVarInt(offset, this.#encodeZigZag(value));
		return offset;
	};

	setVector2(offset, x, y) {
	    offset = this.setSignedVarInt(offset, x);
	    offset = this.setSignedVarInt(offset, y);
	    return offset;
	}
};
