import React, { PureComponent, Component } from "react"
import PropTypes from "prop-types"
import { Grid, Row, Col } from "react-flexbox-grid"
import FontIcon from "material-ui/FontIcon"
import { connect } from "react-redux"
import { withRouter } from "react-router"
import { Card, CardHeader, CardText } from "material-ui/Card"
import SelectField from "material-ui/SelectField"
import TextField from "material-ui/TextField"
import MenuItem from "material-ui/MenuItem"
import ReactTooltip from "react-tooltip"
import { Table, Column, Cell } from "fixed-data-table-2"
import AllocationStatusIcon from "../AllocationStatusIcon/AllocationStatusIcon"
import AllocationLink from "../AllocationLink/AllocationLink"
import FilterFreetext from "../FilterFreetext/FilterFreetext"
import JobLink from "../JobLink/JobLink"
import ClientLink from "../ClientLink/ClientLink"
import FormatTime from "../FormatTime/FormatTime"
import { NOMAD_WATCH_ALLOCATION_HEALTH, NOMAD_UNWATCH_ALLOCATION_HEALTH } from "../../sagas/event"
import { green500, red500 } from "material-ui/styles/colors"

const nodeIdToNameCache = {}
const allocIdRegexp = /\[(\d+)\]/

const getAllocationNumberFromName = allocationName => {
  const match = allocIdRegexp.exec(allocationName)
  return match[1]
}

/* eslint-disable react/prop-types */

const AllocationStatusIconCell = ({ rowIndex, data, ...props }) => (
  <Cell
    {...props}
    onMouseEnter={() => {
      ReactTooltip.show()
    }}
    onMouseLeave={() => {
      ReactTooltip.hide()
    }}
  >
    <AllocationStatusIcon allocation={data[rowIndex]} />
  </Cell>
)

const AllocationLinkCell = ({ rowIndex, data, ...props }) => (
  <Cell {...props}>
    <AllocationLink allocationId={data[rowIndex].ID} />
  </Cell>
)

const JobLinkCell = ({ rowIndex, data, ...props }) => (
  <Cell {...props}>
    <JobLink jobId={data[rowIndex].JobID} />
  </Cell>
)

const JobTaskGroupLinkCell = ({ rowIndex, data, ...props }) => (
  <Cell {...props}>
    <JobLink jobId={data[rowIndex].JobID} taskGroupId={data[rowIndex].TaskGroupId}>
      {data[rowIndex].TaskGroup} (#{getAllocationNumberFromName(data[rowIndex].Name)})
    </JobLink>
  </Cell>
)

const ClientLinkCell = ({ rowIndex, data, clients, ...props }) => (
  <Cell {...props}>
    <ClientLink clientId={data[rowIndex].NodeID} clients={clients} />
  </Cell>
)
const HealthCell = ({ rowIndex, data, ...props }) => (
  <Cell {...props}>
    <ConsulHealth allocation={data[rowIndex]} />
  </Cell>
)

const AgeCell = ({ rowIndex, data, ...props }) => (
  <Cell
    {...props}
    onMouseEnter={() => {
      ReactTooltip.show()
    }}
    onMouseLeave={() => {
      ReactTooltip.hide()
    }}
  >
    <FormatTime inTable identifier={data[rowIndex].ID} time={data[rowIndex].CreateTime} />
  </Cell>
)

class ConsulHealthReal extends PureComponent {
  componentDidMount() {
    this.watch(this.props)
  }

  componentWillUnmount() {
    this.unwatch(this.props)
  }

  unwatch(props) {
    if (props.allocation.ClientStatus != "running") {
      return
    }

    this.props.dispatch({
      type: NOMAD_UNWATCH_ALLOCATION_HEALTH,
      payload: {
        id: props.allocation.ID,
        client: props.allocation.NodeID
      }
    })
  }

  watch(props) {
    if (props.allocation.ClientStatus != "running") {
      return
    }

    this.props.dispatch({
      type: NOMAD_WATCH_ALLOCATION_HEALTH,
      payload: {
        id: props.allocation.ID,
        client: props.allocation.NodeID
      }
    })
  }

  componentWillReceiveProps(nextProps) {
    // if we get a new allocation, unsubscribe from the old and subscribe to the new
    if (this.props.allocation.ID != nextProps.allocation.ID) {
      this.unwatch(this.props)
      this.watch(nextProps)
      return
    }

    // if the current allocation changed from running to something else, unsubscribe
    if (this.props.allocation.ClientStatus == "running" && nextProps.allocation.ClientStatus != "running") {
      this.unwatch(this.props)
    }

    // if the current allocation changed anything to running, subscrube to health
    if (this.props.allocation.ClientStatus != "running" && nextProps.allocation.ClientStatus == "running") {
      this.watch(nextProps)
    }
  }

  render() {
    const allocID = this.props.allocation.ID
    const health = this.props.allocationHealth[allocID]
    if (!health) {
      return null
    }

    let icon = ""

    if (health.Healthy) {
      icon = (
        <FontIcon color={green500} className="material-icons">
          {health.Total > 1 ? "done_all" : "done"}
        </FontIcon>
      )
    }

    if (health.Healthy == false) {
      icon = (
        <FontIcon color={red500} className="material-icons">
          clear
        </FontIcon>
      )
    }

    return <div>{icon}</div>
  }
}

function mapStateToProps({ allocationHealth }) {
  return { allocationHealth }
}

const ConsulHealth = connect(mapStateToProps)(ConsulHealthReal)

const StatusCell = ({ rowIndex, data, ...props }) => <Cell {...props}>{data[rowIndex].ClientStatus}</Cell>

const ActionsCell = ({ rowIndex, data, ...props }) => (
  <Cell {...props}>
    <AllocationLink allocationId={data[rowIndex].ID} linkAppend="/files" linkQuery={{ path: "/alloc/logs/" }}>
      <FontIcon className="material-icons">format_align_left</FontIcon>
    </AllocationLink>
  </Cell>
)

/* eslint-disable react/prop-types */

const jobColumn = (allocations, display) =>
  display ? (
    <Column header={<Cell>Job</Cell>} cell={<JobLinkCell data={allocations} />} flexGrow={2} width={200} />
  ) : null

const clientColumn = (allocations, display, clients) =>
  display ? (
    <Column
      header={<Cell>Client</Cell>}
      cell={<ClientLinkCell data={allocations} clients={clients} />}
      flexGrow={2}
      width={200}
    />
  ) : null

const consulHealthColumn = allocations =>
  CONSUL_ENABLED ? <Column header={<Cell>Health</Cell>} cell={<HealthCell data={allocations} />} width={200} /> : null

class AllocationList extends Component {
  constructor(props) {
    super(props)

    this.resizeHandler = this.updateDimensions.bind(this)
  }

  filteredAllocations() {
    let allocations = this.props.allocations
    const query = this.props.location.query || {}

    if ("allocation_id" in query) {
      allocations = allocations.filter(allocation => allocation.ID.indexOf(query.allocation_id) != -1)
    }

    if ("allocation_id" in this.state) {
      allocations = allocations.filter(allocation => allocation.ID.indexOf(this.state.allocation_id) != -1)
    }

    if ("status" in query) {
      allocations = allocations.filter(allocation => allocation.ClientStatus === query.status)
    }

    if ("client" in query) {
      const matchedClients = this.props.nodes.filter((v, i) => v.Name.indexOf(query.client) != -1).map((v, i) => v.ID)
      allocations = allocations.filter(allocation => matchedClients.indexOf(allocation.NodeID) != -1)
    }

    if ("job" in query) {
      allocations = allocations.filter(allocation => allocation.JobID.indexOf(query.job) != -1)
    }

    return allocations
  }

  allocationStatusFilter() {
    const location = this.props.location
    const query = this.props.location.query || {}
    const title = "Status"
    const handleChange = (event, index, value) => {
      this.props.router.push({
        pathname: location.pathname,
        query: { ...query, status: value }
      })
    }

    return (
      <Col key="allocation-status-filter-pane" xs={12} sm={6} md={6} lg={3}>
        <SelectField
          floatingLabelText={title}
          maxHeight={200}
          value={query.status || undefined}
          onChange={handleChange}
        >
          <MenuItem />
          <MenuItem value="running" primaryText="Running" />
          <MenuItem value="complete" primaryText="Complete" />
          <MenuItem value="pending" primaryText="Pending" />
          <MenuItem value="lost" primaryText="Lost" />
          <MenuItem value="failed" primaryText="Failed" />
        </SelectField>
      </Col>
    )
  }

  allocationIdFilter() {
    return (
      <Col key="allocation-id-filter-pane" xs={12} sm={6} md={6} lg={3}>
        <FilterFreetext query="allocation_id" label="ID" />
      </Col>
    )
  }

  jobIdFilter() {
    return (
      <Col key="job-filter-pane" xs={12} sm={6} md={6} lg={3}>
        <FilterFreetext query="job" label="Job" focusOnLoad />
      </Col>
    )
  }

  clientFilter() {
    return (
      <Col key="client-filter-pane" xs={12} sm={6} md={6} lg={3}>
        <FilterFreetext query="client" label="Client" />
      </Col>
    )
  }

  updateDimensions() {
    this.setState({
      width: window.innerWidth,
      height: window.innerHeight
    })
  }

  componentWillMount() {
    this.updateDimensions()
  }

  componentDidMount() {
    window.addEventListener("resize", this.resizeHandler)
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.resizeHandler)
  }

  render() {
    const showJobColumn = this.props.showJobColumn
    const showClientColumn = this.props.showClientColumn
    const allocations = this.filteredAllocations()

    let width = this.state.width - 240

    if (!showClientColumn || !showJobColumn) {
      width = width - 30
    }

    let height = this.state.height - 165

    if (!showJobColumn || !showClientColumn || this.props.nested) {
      height = height - 120
    }

    if (height < 300) {
      height = 300
    }

    return (
      <div>
        <Card key="filter">
          <CardText>
            <Grid fluid style={{ padding: 0, margin: 0 }}>
              <Row>
                {showJobColumn ? this.jobIdFilter() : null}
                {this.allocationIdFilter()}
                {this.allocationStatusFilter()}
                {showClientColumn ? this.clientFilter() : null}
              </Row>
            </Grid>
          </CardText>
        </Card>

        <Card key="list" style={{ marginTop: "1rem" }}>
          <CardText>
            <Table
              key="table"
              rowHeight={35}
              headerHeight={35}
              rowsCount={allocations.length}
              height={height}
              width={width}
              touchScrollEnabled
              {...this.props}
            >
              <Column header={<Cell />} cell={<AllocationStatusIconCell data={allocations} />} width={40} />
              <Column header={<Cell>ID</Cell>} cell={<AllocationLinkCell data={allocations} />} width={100} />
              {jobColumn(allocations, this.props.showJobColumn)}
              <Column
                header={<Cell>Task Group</Cell>}
                cell={<JobTaskGroupLinkCell data={allocations} />}
                flexGrow={2}
                width={200}
              />
              <Column header={<Cell>Status</Cell>} cell={<StatusCell data={allocations} />} width={200} />
              {clientColumn(allocations, this.props.showClientColumn, this.props.nodes)}
              <Column header={<Cell>Age</Cell>} cell={<AgeCell data={allocations} />} width={100} />
              <Column header={<Cell>Actions</Cell>} cell={<ActionsCell data={allocations} />} width={100} />
              {consulHealthColumn(allocations)}
            </Table>
            <ReactTooltip />
          </CardText>
        </Card>
      </div>
    )
  }
}

AllocationList.defaultProps = {
  allocations: [],
  nodes: [],
  location: {},

  showJobColumn: true,
  showClientColumn: true,
  nested: false
}

AllocationList.propTypes = {
  allocations: PropTypes.array.isRequired,
  nodes: PropTypes.array.isRequired,
  location: PropTypes.object.isRequired,
  router: PropTypes.object.isRequired,
  nested: PropTypes.bool.isRequired,
  showJobColumn: PropTypes.bool.isRequired,
  showClientColumn: PropTypes.bool.isRequired
}

export default withRouter(AllocationList)
