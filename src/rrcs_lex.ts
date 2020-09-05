import * as Logger from './log'
import {ArtistPortInfo} from './rrcs'
import {Crosspoint, CrosspointSync, CrosspointSyncType, xpvtid, CrosspointVolumeTarget} from './rrcs_defs'

const log = Logger.get('RRCSLX');

export function parsePorts(ports: ArtistPortInfo[])
{
    let masters: CrosspointSync[] = [];
    let exprs: RRCSExpression[]   = [];

    ports.forEach(port => {
        if (port.Subtitle)
            parseRRCSExpressions(
                exprs, RRCSExpressionSource.SUBTITLE, port.Subtitle, port);

        if (port.Name)
            parseRRCSExpressions(
                exprs, RRCSExpressionSource.NAME, port.Name, port);

        if (port.Label)
            parseRRCSExpressions(
                exprs, RRCSExpressionSource.LABEL, port.Label, port);

        if (port.Alias)
            parseRRCSExpressions(
                exprs, RRCSExpressionSource.ALIAS, port.Alias, port);
    });

    let ids: RRCSPortID[]
        = <RRCSPortID[]>exprs.filter(ex => ex.type === RRCSExpressions.PORT_ID);
    let vts: RRCSVolumeTargetExpression[]
        = <RRCSVolumeTargetExpression[]>exprs.filter(
            ex => ex.type === RRCSExpressions.SYNC_VOLUME_TARGET);

    for (let tgt of vts) {

        let srcid  = findPortForID(ids, tgt.volsrc_src, true);
        let destid = findPortForID(ids, tgt.volsrc_dest, false);

        if (srcid == null || destid == null) {
            log.error(`Failed to build VolumeTarget (${tgt.volsrc_src}/${tgt.volsrc_dest})`);
            continue;
        }

        let masterxp: Crosspoint = {
            Source: { Node: srcid.port.Node, Port: srcid.port.Port, IsInput: true },
            Destination: { Node: destid.port.Node, Port: destid.port.Port, IsInput: false }
        }

        let xpsync: CrosspointSync = {
            state: false,
            vol: 0,
            type: CrosspointSyncType.SINGLE,
            exclude: [],
            slaves: [],
            master: {
                xp: masterxp,
                conf: tgt.conf
            }
        }

        let slavesrc = findPortForID(ids, tgt.fromxp_src, true);

        if (slavesrc == null) {
            log.error(`Could not find source port for volume target XP`);
        }

        let slave: CrosspointVolumeTarget = {
            xp: {
                Source: {
                    Node: slavesrc.port.Node,
                    Port: slavesrc.port.Port,
                    IsInput: true
                },
                Destination: {
                    Node: tgt.port.Node,
                    Port: tgt.port.Port,
                    IsInput: false
                }
            },
            set: false,
            single: !tgt.use_conf,
            conf: tgt.use_conf
        }

        let newmasterid = xpvtid(xpsync.master);
        let oldmasteridx = masters.findIndex(ms => xpvtid(ms.master) === newmasterid);
        if (oldmasteridx != -1) {
            mergeslaves(masters[oldmasteridx], [ slave ]);
        } else {
            xpsync.slaves.push(slave);
            masters.push(xpsync);
        }
    }

    return masters;
}

function mergeslaves(xps: CrosspointSync, slvs: CrosspointVolumeTarget[]) {

}

function findPortForID(ids: RRCSPortID[], id: string, input: boolean)
{
    return ids.find(
        i => i.id === id
             && ((i.port.Input === input) || (i.port.Output !== input)));
}

enum RRCSExpressionSource {
    NAME,
    LABEL,
    ALIAS,
    SUBTITLE
}

enum RRCSExpressions {
    ANY,
    PORT_ID,
    SYNC_VOLUME_TARGET,
    SYNC_XP_TARGET
}

interface RRCSExpression {
    port: ArtistPortInfo, type: RRCSExpressions, str: string,
        source: RRCSExpressionSource
}

interface RRCSPortID extends RRCSExpression {
    id: string
}

interface RRCSVolumeTargetExpression extends RRCSExpression {
    fromxp_src: string, volsrc_src: string, volsrc_dest: string, conf: boolean,
        single: boolean, use_conf: boolean
}

interface RRCSSetCrosspointExpression extends RRCSExpression {
}

function _exprs_add_setxp(
    exprs: RRCSExpression[], origin: RRCSExpression, expr: string)
{
    let exprobj = <RRCSSetCrosspointExpression>origin;
    exprs.push(exprobj);
}

function _exprs_add_voltgt(
    exprs: RRCSExpression[], origin: RRCSExpression, char: string, expr: string)
{
    let exprobj    = <RRCSVolumeTargetExpression>origin;
    let fromxp_tgt = expr.split('/');
    let fromxp     = fromxp_tgt[0];
    let vsource;

    if (char === '&')
        exprobj.use_conf = true;
    else
        exprobj.use_conf = false;

    if (fromxp == null) {
        log.error(
            `Error lexing rrcs expressions in config: Could not extract XPVolume target XP source port from string '${
                expr}'`);
        return;
    }

    if (fromxp_tgt[1]) {
        if (fromxp_tgt[1].indexOf('+') != -1) {
            vsource        = fromxp_tgt[1].split('+');
            exprobj.single = true;
            exprobj.conf   = false;
        }
        else if (fromxp_tgt[1].indexOf('&') != -1) {
            vsource        = fromxp_tgt[1].split('&');
            exprobj.conf   = true;
            exprobj.single = false;
        }
    }

    if (vsource == null || vsource.length != 2) {
        log.error(
            `Error lexing rrcs expressions in config: Could not extract XPVolume source from string ${
                expr}`);
        return;
    }

    exprobj.fromxp_src  = fromxp;
    exprobj.volsrc_src  = vsource[0];
    exprobj.volsrc_dest = vsource[1];
    exprobj.type        = RRCSExpressions.SYNC_VOLUME_TARGET;

    log.debug(`Found [${
        RRCSExpressions[RRCSExpressions.SYNC_VOLUME_TARGET]}] expression in [${
        RRCSExpressionSource[origin.source]}] of port [${
        exprobj.port.Name}]. Target XP src: '${
        exprobj.fromxp_src}' Source XP: (${exprobj.volsrc_src}/${
        exprobj.volsrc_dest})`);

    exprs.push(exprobj);
}

function _exprs_add_id(
    exprs: RRCSExpression[], origin: RRCSExpression, expr: string)
{
    let exprobj  = <RRCSPortID>origin;
    exprobj.id   = expr;
    exprobj.type = RRCSExpressions.PORT_ID;

    log.debug(`Found [${
        RRCSExpressions[RRCSExpressions.PORT_ID]}]            expression in [${
        RRCSExpressionSource[origin.source]}] of port [${origin.port.Name}]: ${
        exprobj.id}`);

    exprs.push(exprobj);
}

function parseRRCSExpressions(exprlist: RRCSExpression[],
                              source: RRCSExpressionSource, str: string,
                              port: ArtistPortInfo)
{
    let exprs = str.split(' ');

    let origin: RRCSExpression
        = { port, str, source, type : RRCSExpressions.ANY }

          exprs.forEach(ex => {
              switch (ex.charAt(0)) {
                  case '!':
                      _exprs_add_setxp(exprlist, origin, ex.substr(1));
                      break;
                  case '+':
                      _exprs_add_voltgt(exprlist, origin, '+', ex.substr(1));
                      break;
                  case '&':
                      _exprs_add_voltgt(exprlist, origin, '&', ex.substr(1));
                      break;
                  case '$':
                      _exprs_add_id(exprlist, origin, ex.substr(1));
                      break;
              }
          });
}