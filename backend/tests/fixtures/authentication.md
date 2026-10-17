# Authentication Guide

## Sessions vs tokens
Server-side sessions store state on the server. Token-based auth keeps the server stateless.

## Refresh token rotation
Every time a refresh token is used, the server issues a new one and invalidates the old one. If an old refresh token is reused, the server revokes the whole family because this signals theft.
