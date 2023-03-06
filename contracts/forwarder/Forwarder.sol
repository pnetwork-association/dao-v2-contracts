// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {IERC777Recipient} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";
import {NonblockingLzApp} from "@layerzero/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";

error CallFailed(address target, bytes data);
error InvalidCallParams(address[] targets, bytes[] data);

contract Forwarder is IERC777Recipient, Context, NonblockingLzApp {
    mapping(bytes32 => bool) public requests;
    address public sender;
    address public token;

    constructor(address _token, address _sender, address _lzEndpoint) NonblockingLzApp(_lzEndpoint) {
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24).setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );

        sender = _sender;
        token = _token;
    }

    function tokensReceived(
        address /*_operator*/,
        address _from,
        address /*_to,*/,
        uint256 /*_amount*/,
        bytes calldata _userData,
        bytes calldata /*_operatorData*/
    ) external override {
        if (_msgSender() == token && _from == sender) {
            (, bytes memory userData, , , , , , ) = abi.decode(
                _userData,
                (bytes1, bytes, bytes4, address, bytes4, address, bytes, bytes)
            );

            (address[] memory targets, bytes[] memory data) = abi.decode(userData, (address[], bytes[]));

            _processCalls(targets, data);

            // TODO: check better how to calculate the id
            /*bytes32 requestId = keccak256(abi.encode(targets, data));
            if (requests[requestId]) {
                _processCalls(targets, data);
            } else {
                requests[requestId] = true;
            }*/
        }
    }

    function call(address[] calldata targets, bytes[] calldata data) external payable {
        _processCalls(targets, data);
    }

    function lzSend(uint16 _dstChainId, bytes memory _payload, address payable _refundAddress, address _zroPaymentAddress, bytes memory _adapterParams, uint _nativeFee) external {
        _lzSend( // {value: messageFee} will be paid out of this contract!
            _dstChainId, // destination chainId
            _payload, // abi.encode()'ed bytes
            _refundAddress, // (msg.sender will be this contract) refund address (LayerZero will refund any extra gas back to caller of send()
            _zroPaymentAddress, // future param, unused for this example
            _adapterParams, // v1 adapterParams, specify custom destination gas qty
            _nativeFee
        );
    }

    function _processCalls(address[] memory targets, bytes[] memory data) internal {
        if (targets.length != data.length) {
            revert InvalidCallParams(targets, data);
        }

        for (uint256 i = 0; i < targets.length; ) {
            (bool success, ) = targets[i].call(data[i]);
            if (!success) {
                revert CallFailed(targets[i], data[i]);
            }

            unchecked {
                ++i;
            }
        }
    }

    function _nonblockingLzReceive(uint16, bytes memory, uint64, bytes memory) internal override {
        
    }
}
