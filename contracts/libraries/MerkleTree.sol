pragma solidity ^0.8.17;

library MerkleTree {
    function getRoot(bytes32[] memory data) internal pure returns (bytes32) {
        uint256 n = data.length;

        require(n > 1, "Invalid length");

        uint256 j = 0;
        uint256 layer = 0;
        uint256 leaves = _log2(n) + 1;
        bytes32[][] memory nodes = new bytes32[][](leaves * (2 * n - 1));

        for (uint256 l = 0; l <= leaves; ) {
            nodes[l] = new bytes32[](2 * n - 1);
            unchecked {
                ++l;
            }
        }

        for (uint256 i = 0; i < data.length; ) {
            nodes[layer][j] = data[i];
            unchecked {
                ++j;
                ++i;
            }
        }

        while (n > 1) {
            uint256 layerNodes = 0;
            uint k = 0;

            for (uint256 i = 0; i < n; i += 2) {
                if (i + 1 == n) {
                    if (n % 2 == 1) {
                        nodes[layer + 1][k] = nodes[layer][n - 1];
                        unchecked {
                            ++j;
                            ++layerNodes;
                        }
                        continue;
                    }
                }

                nodes[layer + 1][k] = _hashPair(nodes[layer][i], nodes[layer][i + 1]);

                unchecked {
                    ++k;
                    layerNodes += 2;
                }
            }

            n = (n / 2) + (layerNodes % 2 == 0 ? 0 : 1);
            unchecked {
                ++layer;
            }
        }

        return nodes[layer][0];
    }

    function getRootByProofAndLeaf(bytes32 leaf, bytes32[] calldata proof) internal pure returns (bytes32) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            computedHash = _hashPair(computedHash, proof[i]);
        }
        return computedHash;
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? _efficientHash(a, b) : _efficientHash(b, a);
    }

    function _efficientHash(bytes32 a, bytes32 b) internal pure returns (bytes32 value) {
        assembly {
            mstore(0x00, a)
            mstore(0x20, b)
            value := keccak256(0x00, 0x40)
        }
    }

    function _log2(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        unchecked {
            if (value >> 128 > 0) {
                value >>= 128;
                result += 128;
            }
            if (value >> 64 > 0) {
                value >>= 64;
                result += 64;
            }
            if (value >> 32 > 0) {
                value >>= 32;
                result += 32;
            }
            if (value >> 16 > 0) {
                value >>= 16;
                result += 16;
            }
            if (value >> 8 > 0) {
                value >>= 8;
                result += 8;
            }
            if (value >> 4 > 0) {
                value >>= 4;
                result += 4;
            }
            if (value >> 2 > 0) {
                value >>= 2;
                result += 2;
            }
            if (value >> 1 > 0) {
                result += 1;
            }
        }
        return result;
    }
}
