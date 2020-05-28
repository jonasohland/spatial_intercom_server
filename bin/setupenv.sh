#!/bin/sh

export SI_INET_INTERFACES=$(ifconfig en0 | awk '$1 == "inet" {print $2}')
