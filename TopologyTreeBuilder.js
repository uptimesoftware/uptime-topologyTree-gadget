TopologyTreeBuilder = function() {
	var treeMargins = [ 90, 20, 200, 70 ];
	var visDimensions = new UPTIME.pub.gadgets.Dimensions(100, 100);
	var treeDimensions = toTreeDimensions(visDimensions);

	var treeTransitionDuration = 500;
	var tooltipTransitionDuration = 200;

	var root = null;

	var topologyTreeInstance = this;

	var currNodeId = 0;
	var tree = d3.layout.tree().size([ treeDimensions.height, treeDimensions.width ]).children(getChildren).sort(function(a, b) {
		return naturalSort(a.elementName, b.elementName);
	});

	var diagonal = d3.svg.diagonal().projection(function(d) {
		return [ d.y, d.x ];
	});
	var vis = d3.select("#topoTree").append("svg:svg").attr("width", visDimensions.width).attr("height", visDimensions.height)
			.append("svg:g").attr("transform", "translate(" + treeMargins[0] + "," + treeMargins[1] + ")");
	vis.append("svg:text").style("opacity", 1e-6);

	this.resize = function(dimensions) {

		visDimensions = dimensions;
		treeDimensions = toTreeDimensions(visDimensions);

		d3.select("svg").attr("width", visDimensions.width).attr("height", visDimensions.height);

		tree.size([ treeDimensions.height, treeDimensions.width ]);

		if (root != null) {
			topologyTreeInstance.updateTree(root);
		}

	};

	this.buildTree = function(source) {

		root = source;
		root.x0 = treeDimensions.height / 2;
		root.y0 = 10;
		$("#inProgressBar").hide();
		$("#selectTopLevelParentContainer").show();
		$("#tooltip").show();
		topologyTreeInstance.updateTree(root);
	};

	this.updateTree = function(source) {

		// Compute the new tree layout.
		var nodes = tree.nodes(root).reverse();

		detectCollisions(nodes);

		var node = vis.selectAll("g.node").data(nodes, function(d) {
			return d.id || (d.id = ++currNodeId);
		});

		renderLinks(nodes, source);

		createNewNodes(node, source);

		updateExistingNodes(node);

		removeExitingNodes(node, source);

		// Stash the old positions for transition.
		nodes.forEach(function(d) {
			d.x0 = d.x;
			d.y0 = d.y;
		});

	};

	this.displayError = function(message) {
		$("#topoTree").hide();
		$("#tooltip").hide();
		$("#error").text(message).show();
	};

	function toTreeDimensions(dimensions) {
		var w = dimensions.width - treeMargins[0] - treeMargins[2];
		var h = dimensions.height - treeMargins[1] - treeMargins[3];
		return new UPTIME.pub.gadgets.Dimensions(w, h);
	}

	function getChildren(node) {
		if (!node.hasChildren || node.expansion == "none") {
			return [];
		}
		var children = $.merge([], node.branches);
		if (node.expansion == "full") {
			return $.merge(children, node.leaves);
		}
		return children;
	}

	function getFillColor(node) {
		if (node.elementId == 0) {
			return "black";
		}
		switch (node.elementStatus) {
		case "CRIT":
			return "#B61211";
		case "WARN":
			return "#DAD60B";
		case "OK":
			return "#67B10B";
		case "MAINT":
			return "#555B98";
		case "UNKNOWN":
		default:
			return "#E6E6E6";
		}
	}

	function getStrokeWidthBasedOnChildren(node) {
		if (node.hasChildren && node.expansion != "full") {
			if (node.expansion == "none") {
				return 6.5 + (node.branches.length + node.leaves.length) * 0.1;
			} else if (node.leaves.length > 0) {
				return 6.5 + node.leaves.length * 0.1;
			}
		}
		return 4.5;
	}

	function nodeClickHandler(node) {
		if (!node.hasChildren) {
			return;
		}
		if (node.expansion == "full") {
			node.expansion = "none";
		} else if (node.expansion == "none") {
			node.expansion = (node.branches.length > 0 && node.leaves.length > 0) ? "partial" : "full";
		} else {
			node.expansion = "full";
		}
		topologyTreeInstance.updateTree(node);
	}

	function redirectToElementProfilePage(node) {
		if (node.elementId == 0) {
			return;
		}
		var url = uptimeGadget.getElementUrls(node.elementId, node.elementName);
		window.top.location.href = url.services;
	}

	function showStatusDetail(node) {
		if (node.elementId == 0) {
			return;
		}
		var text = d3.select(this).select("text");
		text.style("fill-opacity", getTextOpacity(node));

		showStatusMessage(node);

		highlightPath(node);
	}

	function showStatusMessage(node) {
		var div = d3.select("#tooltip");

		div.transition().duration(tooltipTransitionDuration).style("opacity", 1).style("border-color", getFillColor(node));

		div.html(constructMessage(node)).style("left", (d3.event.pageX + 10) + "px").style("top", (d3.event.pageY - 28) + "px");
	}

	function constructMessage(node) {
		var message = '<ul class="tooltipDetail">';
		message += '<li><div class="tooltipDetailTitle">Element Name:</div><div>' + node.elementName + '</div></li>';
		message += '<li><div class="tooltipDetailTitle">Element Status:</div><div>' + node.elementStatus + '</div></li>';
		if (node.statusMessage) {
			message += '<li><div class="tooltipDetailTitle">Status Message:</div><div>' + node.statusMessage + '</div></li>';
		}
		message += '<li><div class="tooltipDetailTitle">Element Type:</div><div>' + node.elementType + '</div></li>';
		if (node.monitorStatus.length > 0) {
			message += '<hr style="clear:both"/>';
			$.each(node.monitorStatus, function(i, monitorStatus) {
				message += '<li><div class="tooltipDetailTitle">' + monitorStatus.name + ':</div><div>' + monitorStatus.status
						+ '</div></li>';
			});
		}
		message += '</ul>';
		return message;
	}

	function hideStatusDetail(node) {

		var text = d3.select(this).select("text");
		text.style("fill-opacity", getTextOpacity(node));
		var div = d3.select("#tooltip");
		div.transition().duration(tooltipTransitionDuration).style("opacity", 1e-6);
		vis.selectAll(".link").style("stroke", "lightgrey");
	}

	function highlightPath(node) {
		var eligibleTargets = getEligibleTargetIds(node);
		vis.selectAll(".link").style("stroke", function(p) {

			var linkId = p.target.id;
			if (eligibleTargets.indexOf(linkId) != -1) {
				return getFillColor(node);
			}
		});
	}

	function getEligibleTargetIds(node) {
		var eligibleIds = [];
		eligibleIds.push(node.id);
		if (node.parent) {
			eligibleIds = eligibleIds.concat(getEligibleTargetIds(node.parent));
		}
		return eligibleIds;
	}

	function getTextOpacity(node) {
		if (node.elementId == 0) {
			return 0.5;
		}
		if (node.hasChildren || node.isCollide == false) {
			return 1;
		}
		return 1e-6;
	}

	function removeExitingNodes(node, source) {
		// Transition exiting nodes to the parent's new position.
		var nodeExit = node.exit().transition().duration(treeTransitionDuration).attr("transform", function(d) {
			return "translate(" + source.y + "," + source.x + ")";
		}).remove();

		nodeExit.select("circle").attr("r", 1e-6);

		nodeExit.select("text").style("fill-opacity", 1e-6);

	}

	function updateExistingNodes(node) {
		// Transition nodes to their new position.
		var nodeUpdate = node.transition().duration(treeTransitionDuration).attr("transform", function(d) {
			return "translate(" + d.y + "," + d.x + ")";
		});

		nodeUpdate.select("circle").attr("r", getStrokeWidthBasedOnChildren).style("fill", getFillColor).style("stroke",
				"midnightblue");

		nodeUpdate.select("text").attr("text-anchor", function(d) {
			return hasVisibleChildren(d) ? "end" : "start";
		}).attr("x", function(d) {
			return hasVisibleChildren(d) ? -20 : 20;
		}).style("fill-opacity", getTextOpacity);
	}

	function hasVisibleChildren(node) {
		return node.hasChildren && (node.expansion == "full" || (node.expansion != "none" && node.branches.length > 0));
	}

	function createNewNodes(node, source) {

		// Enter any new nodes at the parent's previous position.

		var nodeEnter = node.enter().append("svg:g").attr("class", "node").attr("transform", function(d) {
			return "translate(" + source.y0 + "," + source.x0 + ")";
		}).on("mouseover", showStatusDetail).on("mouseout", hideStatusDetail);

		nodeEnter.append("svg:circle").attr("r", 1e-6).style("fill", getFillColor).on("click", nodeClickHandler);

		nodeEnter.append("svg:text").attr("dy", ".35em").text(function(d) {
			return d.elementName;
		}).style("fill-opacity", 1e-6).on("click", redirectToElementProfilePage);
	}

	function renderLinks(nodes, source) {
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
		link.transition().duration(treeTransitionDuration).attr("d", diagonal);

		// Transition exiting nodes to the parent's new position.
		link.exit().transition().duration(treeTransitionDuration).attr("d", function(d) {
			var o = {
				x : source.x,
				y : source.y
			};
			return diagonal({
				source : o,
				target : o
			});
		}).remove();
	}

	function isCollide(node, node_sibling) {
		var r = getStrokeWidthBasedOnChildren(node);
		n1x1 = node.x - r, n1x2 = node.x + r;
		n1y1 = node.y - r, n1y2 = node.y + r;
		var r2 = getStrokeWidthBasedOnChildren(node_sibling);
		n2x1 = node_sibling.x - r2, n2x2 = node_sibling.x + r2;
		n2y1 = node_sibling.y - r2, n2y2 = node_sibling.y + r2;
		result = ((n1x1 < n2x2 && n1x1 > n2x1) || (n1x2 > n2x2 && n1x2 < n2x1))
				&& ((n1y1 <= n2y2 && n1y1 >= n2y1) || (n1y2 >= n2y2 && n1y2 <= n2y1));

		return result;
	}

	function detectCollisions(nodes) {
		nodes.forEach(function(node) {
			node.isCollide = false;
			if (node.parent) {
				$.each(getChildren(node.parent), function(i, sibling) {
					if (node.elementId != sibling.elementId && isCollide(node, sibling)) {
						node.isCollide = true;
					}
				});
			}
		});
	}

};