// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.17;

// Be sure to use this contract in a forked environment where the real implementation is already deployed
contract Kernel {
    /* Hardcoded constants to save gas
    bytes32 public constant APP_MANAGER_ROLE = keccak256("APP_MANAGER_ROLE");
    */
    bytes32 public constant APP_MANAGER_ROLE = 0xb6d92708f3d4817afc106147d969e229ced5c46e65e0a5002a0d391287762bd0;

    event SetApp(bytes32 indexed _namespace, bytes32 indexed _appId, address _app);

    function newAppInstance(bytes32 _appId, address _appBase) public {}

    function newAppInstance(
        bytes32 _appId,
        address _appBase,
        bytes calldata _initializePayload,
        bool _setDefault
    ) public {}

    // /*auth(APP_MANAGER_ROLE, arr(_namespace, _appId))
    function setApp(bytes32 _namespace, bytes32 _appId, address _app) public {}

    function getApp(bytes32 _namespace, bytes32 _appId) public view returns (address) {}

    function acl() public view returns (address) {}

    function hasPermission(
        address _who,
        address _where,
        bytes32 _what,
        bytes calldata _how
    ) public view returns (bool) {}
}
