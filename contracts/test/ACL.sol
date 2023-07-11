// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.17;

// Be sure to use this contract in a forked environment where the real implementation is already deployed
contract ACL {
    function createPermission(address _entity, address _app, bytes32 _role, address _manager) external {}

    function grantPermission(address _entity, address _app, bytes32 _role) external {}

    function hasPermission(address _who, address _where, bytes32 _what, bytes memory _how) public view returns (bool) {}

    function getPermissionManager(address _app, bytes32 _role) public view returns (address) {}

    function setPermissionManager(address _newManager, address _app, bytes32 _role) external {}

    function revokePermission(address _entity, address _app, bytes32 _role) external {}
}
