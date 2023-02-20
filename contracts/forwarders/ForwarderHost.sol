// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC777RecipientUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC777/IERC777RecipientUpgradeable.sol";
import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {IForwarderHost} from "../interfaces/IForwarderHost.sol";
import {IStakingManager} from "../interfaces/IStakingManager.sol";
import {IErc20Vault} from "../interfaces/external/IErc20Vault.sol";
import {Helpers} from "../libraries/Helpers.sol";
import {Errors} from "../libraries/Errors.sol";

import "hardhat/console.sol";

contract ForwarderHost is IForwarderHost, IERC777RecipientUpgradeable, Initializable, UUPSUpgradeable, OwnableUpgradeable {
    address public pToken;
    address public forwarderNative;
    address public stakingManager;

    function initialize(address _pToken, address _forwarderNative, address _stakingManager) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24).setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );

        pToken = _pToken;
        forwarderNative = _forwarderNative;
        stakingManager = _stakingManager;
    }

    function tokensReceived(
        address /*_operator*/,
        address _from,
        address /*_to,*/,
        uint256 _amount,
        bytes calldata _userData,
        bytes calldata /*_operatorData*/
    ) external override {
        if (_from == address(0) && _msgSender() == pToken) {
            (, bytes memory userData, , address originatingAddress) = abi.decode(_userData, (bytes1, bytes, bytes4, address));

            if (originatingAddress != forwarderNative) {
                revert Errors.InvalidOriginatingAddress(originatingAddress);
            }
            
            bytes4 fxSignature = abi.decode(userData, (bytes4));

            // bytes4(keccak256("stake(uint256,uint64,address)")
            if (fxSignature == 0x93ac045f) {
                (, uint64 duration, address receiver) = abi.decode(userData, (bytes4, uint64, address));
                IERC20Upgradeable(pToken).approve(stakingManager, _amount);
                IStakingManager(stakingManager).stake(_amount, duration, receiver);
            }
            
        }
    }


    function _authorizeUpgrade(address) internal override onlyOwner {}
}
