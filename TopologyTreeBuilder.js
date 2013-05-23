TopologyTreeBuilder = function(options) {
	var links;
	var height = 100;
	var width = 100;

	var root = null;

	if (typeof options == "object") {
		if (typeof options.height == "number") {
			height = options.height;
		}
		if (typeof options.width == "number") {
			width = options.width;
		}
	}
	var topologyTreeInstance = this;

	var m = [ 145, 20, 200, 70 ], w = width - m[0] - m[2], h = height - m[1] - m[3], i = 0;
	var tree = d3.layout.tree().size([ h, w ]).children(function(d) {
		return d.dependents;
	}).sort(function(a, b) {
		return naturalSort(a.entityName, b.entityName);
	});

	var diagonal = d3.svg.diagonal().projection(function(d) {
		return [ d.y, d.x ];
	});
	var vis = d3.select("#topoTree").append("svg:svg").attr("width", width).attr("height", height).append("svg:g").attr(
			"transform", "translate(" + m[0] + "," + m[1] + ")");

	this.resize = function(dimensions) {

		var newWidth = dimensions.width;
		var newHeight = dimensions.height;

		var m = [ 145, 20, 200, 70 ], w = newWidth - m[0] - m[2], h = newHeight - m[1] - m[3];

		vis = d3.select("svg").attr("width", newWidth).attr("height", newHeight);

		tree = tree.size([ h, w ]);

		topologyTreeInstance.updateTree(root);

	};

	this.buildTree = function(source) {

		root = source;
		root.x0 = h / 2;
		root.y0 = 10;
		$("#inProgressBar").hide();
		$("#showEntireTreeContainer").show();
		$("#selectTopLevelParentContainer").show();
		if (!uptimeGadget.isOwner()) {
			disableTreeControls();
		}
		topologyTreeInstance.updateTree(root);

		vis.append("svg:text").style("opacity", 1e-6);
	};

	this.updateTree = function(source) {

		var textPositionOffset = 20;
		var duration = d3.event && d3.event.altKey ? 5000 : 500;

		// Compute the new tree layout.
		var nodes = tree.nodes(root).reverse();

		detectCollisions(nodes);

		var node = vis.selectAll("g.node").data(nodes, function(d) {
			return d.id || (d.id = ++i);
		});

		renderLinks(nodes, source, duration);

		createNewNodes(node, source, textPositionOffset);

		updateExistingNodes(node, duration, textPositionOffset);

		removeExitingNodes(node, duration, source);

		// Stash the old positions for transition.
		nodes.forEach(function(d) {
			d.x0 = d.x;
			d.y0 = d.y;
		});

	};

	this.displayError = function(message) {
		$("#topoTree").hide();
		$("#tooltip").hide();
		$("#error").text("Error loading topological failure tree.").show();
	};

	var disableTreeControls = function() {
		$("#showEntireTreeCheckbox").prop('disabled', true);
		$("#selectTopLevelParent").prop('disabled', true);
		$.each($("#selectTopLevelParent > option"), function(i, option) {
			$(option).prop('disabled', true);
		});
		$("#selectTopLevelParent").trigger("liszt:updated");
	};

	var getFillColour = function(d) {
		var entityStatus = d.entityStatus;
		if (d.entityId == 0) {
			return "black";
		}
		if (entityStatus == "OK") {
			return "lawngreen";
		}
		if (entityStatus == "MAINT") {
			return "dodgerblue";
		}
		if (entityStatus == "CRIT") {
			return "orangered";
		}
		if (entityStatus == "WARN") {
			return "gold";
		}
		if (entityStatus == "UNKNOWN") {
			return "darkgrey";
		}
	};

	var getStrokeWidthBasedOnChildren = function(node) {
		if (node._children) {
			return 6.5 + node._children.length * 0.1;
		}
		return 4.5;
	};

	var nodeClickHandler = function(node) {
		toggle(node);
		topologyTreeInstance.updateTree(node);
	};

	var goToElement = function(node) {
		var url = uptimeGadget.getElementUrls(node.entityId, node.entityName);
		if (node.type != "Invisible") {
			window.top.location.href = url.services;
		}
	};

	var showStatusDetail = function(d) {
		var text = d3.select(this).select("text");
		text.style("fill-opacity", getTextOpacity(d));

		showStatusMessage(d);

		highlightPath(d);
	};

	var showStatusMessage = function(d) {
		var div = d3.select("#tooltip");

		div.transition().duration(200).style("opacity", 1).style("border-color", getFillColour(d));

		div.html(constructMessage(d)).style("left", (d3.event.pageX + 10) + "px").style("top", (d3.event.pageY - 28) + "px");
	};

	var constructMessage = function(d) {
		var message = "<ul class='tooltipDetail'>";
		message += "<li><div class='tooltipDetailTitle'>Element Name:</div><div>" + d.entityName + "</div></li>";
		message += "<li><div class='tooltipDetailTitle'>Element Status:</div><div>" + d.entityStatus + "</div></li>";
		message += "<li><div class='tooltipDetailTitle'>Status Message:</div><div>" + d.statusMessage + "</div></li>";
		message += "<li><div class='tooltipDetailTitle'>Element Type:</div><div>" + d.type + "</div></li>";
		if (d.monitorStatus != 0) {
			message += "<hr style='clear:both'/>";
			$.each(d.monitorStatus, function(j, monitorStatus) {
				message += "<li><div class='tooltipDetailTitle'>" + monitorStatus.name + ":</div><div>" + monitorStatus.status
						+ "</div></li>";
			});
		}
		message += "</ul>";
		return message;
	};

	var hideStatusDetail = function(d) {

		var text = d3.select(this).select("text");
		text.style("fill-opacity", getTextOpacity(d));
		var div = d3.select("#tooltip");
		div.transition().duration(200).style("opacity", 1e-6);
		vis.selectAll(".link").style("stroke", "lightgrey");
	};

	var highlightPath = function(d) {
		var eligibleTargets = getEligibleTargetIds(d);
		vis.selectAll(".link").style("stroke", function(p) {

			var linkId = p.target.id;
			if (eligibleTargets.indexOf(linkId) != -1) {
				return getFillColour(d);
			}
		});
	};

	var getEligibleTargetIds = function(d) {
		var eligibleIds = [];
		eligibleIds.push(d.id);
		if (d.parent) {
			eligibleIds = eligibleIds.concat(getEligibleTargetIds(d.parent));
		}
		return eligibleIds;
	};

	var getTextOpacity = function(d) {
		if (d.type == "Invisible" && d.isCollide == false) {
			return 0.5;
		}
		if (d.children || d.isCollide == false) {
			return 1;
		}
		return 1e-6;
	};

	var removeExitingNodes = function(node, duration, source) {
		// Transition exiting nodes to the parent's new position.
		var nodeExit = node.exit().transition().duration(duration).attr("transform", function(d) {
			return "translate(" + source.y + "," + source.x + ")";
		}).remove();

		nodeExit.select("circle").attr("r", 1e-6);

		nodeExit.select("text").style("fill-opacity", 1e-6);

	};

	var updateExistingNodes = function(node, duration, textPositionOffset) {
		// Transition nodes to their new position.
		var nodeUpdate = node.transition().duration(duration).attr("transform", function(d) {
			return "translate(" + d.y + "," + d.x + ")";
		});

		nodeUpdate.select("circle").attr("r", getStrokeWidthBasedOnChildren).style("fill", getFillColour).style("stroke",
				"midnightblue");

		nodeUpdate.select("text").attr("text-anchor", function(d) {
			return d.children ? "end" : "start";
		}).attr("x", function(d) {
			return d.children ? -textPositionOffset : textPositionOffset;
		}).style("fill-opacity", getTextOpacity);
	};

	var createNewNodes = function createNewNodes(node, source, textPositionOffset) {

		// Enter any new nodes at the parent's previous position.

		var nodeEnter = node.enter().append("svg:g").attr("class", "node").attr("transform", function(d) {
			return "translate(" + source.y0 + "," + source.x0 + ")";
		}).on("mouseover", showStatusDetail).on("mouseout", hideStatusDetail);

		nodeEnter.append("svg:circle").attr("r", 1e-6).style("fill", getFillColour).on("click", nodeClickHandler);

		nodeEnter.append("svg:text").attr("dy", ".35em").text(function(d) {
			return d.entityName;
		}).style("fill-opacity", 1e-6).on("click", goToElement);
	};

	var renderLinks = function(nodes, source, duration) {
		// Update the links…
		var link = vis.selectAll("path.link").data(tree.links(nodes), function(d) {
			return d.target.id;
		});

		// Enter any new links at the parent's previous position.
		link.enter().insert("svg:path", "g").attr("class", "link").attr("d", function(d) {
			var o = {
				x : source.x0,
				y : source.y0
			};
			return diagonal({
				source : o,
				target : o
			});
		});

		// Transition links to their new position.
		link.transition().duration(duration).attr("d", diagonal);

		// Transition exiting nodes to the parent's new position.
		link.exit().transition().duration(duration).attr("d", function(d) {
			var o = {
				x : source.x,
				y : source.y
			};
			return diagonal({
				source : o,
				target : o
			});
		}).remove();
	};

	// Toggle children.
	var toggle = function(d) {
		if (d.children) {
			d._children = d.dependents;
			d.children = null;
			d.dependents = null;
		} else {
			d.dependents = d._children;
			d.children = d._children;
			d._children = null;
		}
	};

	var detectCollisions = function(nodes) {
		nodes.forEach(function(d, index) {
			d.isCollide = false;
			if (d.parent) {

				var siblings = d.parent.children;
				for ( var i = 0; i < siblings.length; i++) {
					if (d.entityId != siblings[i].entityId) {
						if (isCollide(d, siblings[i])) {
							d.isCollide = true;
						}
					}
				}

			}
		});
	};

	var isCollide = function(node, node_sibling) {
		var r = getStrokeWidthBasedOnChildren(node);
		n1x1 = node.x - r, n1x2 = node.x + r;
		n1y1 = node.y - r, n1y2 = node.y + r;
		var r2 = getStrokeWidthBasedOnChildren(node_sibling);
		n2x1 = node_sibling.x - r2, n2x2 = node_sibling.x + r2;
		n2y1 = node_sibling.y - r2, n2y2 = node_sibling.y + r2;
		result = ((n1x1 < n2x2 && n1x1 > n2x1) || (n1x2 > n2x2 && n1x2 < n2x1))
				&& ((n1y1 <= n2y2 && n1y1 >= n2y1) || (n1y2 >= n2y2 && n1y2 <= n2y1));

		return result;
	};

};